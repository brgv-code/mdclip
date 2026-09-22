import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { accessibilityTrusted, darwin, htmlToRtf, playSound } from '../clipboard/darwin.js';
import { type Config, formatHotkey, loadConfig, parseHotkey } from './config.js';
import { flagMask, keycodeFor } from './keycodes.js';
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

/** Copy the current selection (Cmd+C) and complete the clipboard flavors. */
export async function smartCopy(config: Config): Promise<void> {
  // Nothing selected means the pasteboard never changes: convert whatever is on it already.
  const current = await darwin.copyAndRead();
  const result = enrich(current);
  if (!result) {
    log('nothing to convert (empty clipboard)');
    if (config.notify) await darwin.notify('mdclip', 'Nothing to convert');
    return;
  }
  const { content, direction } = result;
  if (config.rtf && direction === 'md-to-rich' && content.html) content.rtf = await htmlToRtf(content.html);
  await darwin.write(content);

  const summary = direction === 'md-to-rich' ? 'Markdown copied as rich text' : 'Rich text copied as markdown';
  log(`${summary} (${(content.text ?? '').length} chars)`);
  if (config.sound) await playSound(config.sound);
  if (config.notify) await darwin.notify('mdclip', summary);
}

export const HOTKEY_HELPER = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'native', 'mdclip-hotkey');

export async function listen(): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('mdclip listen is macOS only for now.');
  const config = loadConfig();
  const hotkey = parseHotkey(config.hotkey);
  const args = [String(keycodeFor(hotkey.key)), String(flagMask(hotkey))];

  // The helper needs Accessibility to create its event tap. Ask through osascript, which macOS
  // attributes to our app bundle, so the prompt and the Privacy entry say "mdclip".
  if (!(await accessibilityTrusted(true))) {
    log('waiting: allow "mdclip" in System Settings > Privacy & Security > Accessibility');
    while (!(await accessibilityTrusted(false))) await sleep(3000);
    log('Accessibility granted');
  }

  let busy = false;
  const fire = () => {
    if (busy) return;
    busy = true;
    smartCopy(config)
      .catch((err: unknown) => log(`error: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => {
        busy = false;
      });
  };

  // Under the app bundle the tap lives in the launcher (only the bundle holds the grant),
  // and hits arrive on stdin. Standalone, we spawn the same tap as a helper process.
  if (process.env.MDCLIP_FROM_LAUNCHER === '1') {
    log(`listening for ${formatHotkey(hotkey)} (config: ${config.hotkey})`);
    createInterface({ input: process.stdin }).on('line', (line) => {
      if (line === 'hit') fire();
    });
    const launcher = process.ppid;
    setInterval(() => {
      if (launcher !== 1 && process.ppid === 1) process.exit(0);
    }, 5000);
    return new Promise(() => {});
  }

  let stopping = false;
  const startHelper = (): Promise<number> =>
    new Promise((resolve) => {
      const child = spawn(HOTKEY_HELPER, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      createInterface({ input: child.stdout }).on('line', (line) => {
        if (line === 'hit') fire();
        else if (line === 'ready') log(`listening for ${formatHotkey(hotkey)} (config: ${config.hotkey})`);
      });
      createInterface({ input: child.stderr }).on('line', (line) => log(`hotkey: ${line}`));
      child.on('error', (err) => log(`hotkey helper failed to start: ${err.message}`));
      child.on('exit', (code) => resolve(code ?? 1));
      const stop = () => {
        stopping = true;
        child.kill('SIGTERM');
        process.exit(0);
      };
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
      // Launched by the app bundle: if that launcher dies, do not linger as an orphan.
      const launcher = process.ppid;
      if (launcher !== 1) setInterval(() => process.ppid === 1 && stop(), 5000);
    });

  for (;;) {
    const code = await startHelper();
    if (stopping) return;
    if (code === 3) {
      log('event tap refused: re-check Accessibility for "mdclip"');
      while (!(await accessibilityTrusted(false))) await sleep(3000);
    }
    log(`hotkey helper exited (${code}), restarting`);
    await sleep(1000);
  }
}
