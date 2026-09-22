import { appendFileSync } from 'node:fs';
import { darwin, htmlToRtf } from '../clipboard/darwin.js';
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

async function waitForAccessibility(uIOhook: typeof import('uiohook-napi').uIOhook): Promise<void> {
  const eventsFlow = (ms: number) =>
    new Promise<boolean>((resolve) => {
      const done = (ok: boolean) => {
        clearTimeout(t);
        uIOhook.off('input', onInput);
        resolve(ok);
      };
      const onInput = () => done(true);
      const t = setTimeout(() => done(false), ms);
      uIOhook.on('input', onInput);
    });

  uIOhook.start();
  if (await eventsFlow(8000)) return;
  log(
    `no input events: allow "node" (${process.execPath}) in System Settings > Privacy & Security > Accessibility. Waiting.`,
  );
  for (;;) {
    uIOhook.stop();
    await sleep(5000);
    uIOhook.start();
    if (await eventsFlow(4000)) {
      log('Accessibility granted');
      return;
    }
  }
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
  // Keep the loop alive: when the hook cannot start, its thread ends and Node would otherwise exit silently.
  setInterval(() => {}, 60_000);

  // start() asks macOS for Accessibility in-process, so the prompt names this node binary.
  // There is no API for "did the tap work", but a working tap streams mouse moves, so wait for any event.
  await waitForAccessibility(uIOhook);
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

  log(`listening for ${formatHotkey(hotkey)} (config: ${config.hotkey})`);

  const stop = () => {
    uIOhook.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
