import { appendFileSync } from 'node:fs';
import { accessibilityTrusted, darwin, htmlToRtf } from '../clipboard/darwin.js';
import { type Config, formatHotkey, type Hotkey, loadConfig, parseHotkey } from './config.js';
import { enrich } from './smart-copy.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function log(line: string): void {
  const msg = `${new Date().toISOString()} ${line}\n`;
  process.stderr.write(msg);
  if (process.env.MDCLIP_LOG) {
    try {
      appendFileSync(process.env.MDCLIP_LOG, msg);
    } catch {}
  }
}

interface KeyEvent {
  keycode: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

function matches(e: KeyEvent, hotkey: Hotkey, keycode: number): boolean {
  return (
    e.keycode === keycode &&
    e.ctrlKey === hotkey.ctrl &&
    e.shiftKey === hotkey.shift &&
    e.metaKey === hotkey.meta &&
    e.altKey === hotkey.alt
  );
}

const noModifiers = (e: KeyEvent) => !e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey;

/** Copy the current selection (Cmd+C) and complete the clipboard flavors. */
export async function smartCopy(config: Config): Promise<void> {
  const before = await darwin.changeCount();
  await darwin.copy();
  // Wait for the app to finish writing the pasteboard; fall back to whatever is there already.
  for (let i = 0; i < 16 && (await darwin.changeCount()) === before; i++) await sleep(50);

  const current = await darwin.read();
  const result = enrich(current);
  if (!result) {
    log('nothing to convert (empty clipboard)');
    if (config.notify) await darwin.notify('mdclip', 'Nothing to convert');
    return;
  }
  const { content, direction } = result;
  if (direction === 'md-to-rich' && content.html) content.rtf = await htmlToRtf(content.html);
  await darwin.write(content);

  const summary = direction === 'md-to-rich' ? 'Markdown copied as rich text' : 'Rich text copied as markdown';
  log(`${summary} (${(content.text ?? '').length} chars)`);
  if (config.notify) await darwin.notify('mdclip', summary);
}

export async function listen(): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('mdclip listen is macOS only for now.');
  const config = loadConfig();
  const hotkey = parseHotkey(config.hotkey);

  let hook: typeof import('uiohook-napi');
  try {
    hook = await import('uiohook-napi');
  } catch {
    throw new Error('uiohook-napi is not installed. Reinstall mdclip, or run: npm i -g uiohook-napi');
  }
  const { uIOhook, UiohookKey } = hook;

  // uIOhook.start() aborts the process (SIGABRT) when Accessibility is missing, so never call it untrusted.
  // The check runs in osascript, a child, which macOS attributes to our app bundle ("mdclip").
  if (!(await accessibilityTrusted(true))) {
    log('waiting: allow "mdclip" in System Settings > Privacy & Security > Accessibility');
    while (!(await accessibilityTrusted(false))) await sleep(3000);
    log('Accessibility granted');
  }
  const keycode = (UiohookKey as Record<string, number>)[hotkey.key.toUpperCase()];
  if (keycode === undefined) throw new Error(`Unknown key "${hotkey.key}"`);

  let armed = false;
  let timer: NodeJS.Timeout | null = null;
  let busy = false;

  const fire = () => {
    armed = false;
    if (timer) clearTimeout(timer);
    timer = null;
    if (busy) return;
    busy = true;
    smartCopy(config)
      .catch((err: unknown) => log(`error: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => {
        busy = false;
      });
  };

  uIOhook.on('keydown', (e) => {
    if (matches(e, hotkey, keycode) && !armed) {
      armed = true;
      // Modifiers still held when we send Cmd+C would leak into it; wait for release, with a fallback.
      timer = setTimeout(fire, 400);
    }
  });
  uIOhook.on('keyup', (e) => {
    if (armed && noModifiers(e)) fire();
  });

  uIOhook.start();
  // The hook's native thread does not hold the event loop open on its own.
  const keepAlive = setInterval(() => {}, 60_000);
  log(`listening for ${formatHotkey(hotkey)} (config: ${config.hotkey})`);

  const stop = () => {
    clearInterval(keepAlive);
    uIOhook.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  // Launched by the app bundle: if that launcher dies, do not linger as an orphan.
  const launcher = process.ppid;
  if (launcher !== 1) setInterval(() => process.ppid === 1 && stop(), 5000);
}
