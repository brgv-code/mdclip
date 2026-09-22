import { has, run } from './exec.js';
import type { ClipboardAdapter, ClipboardContent } from './types.js';

// Experimental: not covered by CI on a real display server yet. PRs welcome.
// CopyQ is preferred because it is the only common tool that sets several MIME types at once.
// wl-copy and xclip each serve a single type, so with them the HTML flavor wins when present.

async function tool(): Promise<'copyq' | 'wl' | 'xclip' | null> {
  if (await has('copyq')) return 'copyq';
  if (process.env.WAYLAND_DISPLAY && (await has('wl-copy'))) return 'wl';
  if (await has('xclip')) return 'xclip';
  return null;
}

const missing = () => new Error('No clipboard tool found. Install one of: copyq, wl-clipboard (Wayland), xclip (X11).');

async function readType(t: Awaited<ReturnType<typeof tool>>, mime: string): Promise<string | null> {
  let res: { stdout: string; code: number };
  if (t === 'copyq') res = await run('copyq', ['clipboard', mime]);
  else if (t === 'wl') res = await run('wl-paste', ['--no-newline', '--type', mime]);
  else res = await run('xclip', ['-selection', 'clipboard', '-t', mime, '-o']);
  return res.code === 0 && res.stdout ? res.stdout : null;
}

export const linux: ClipboardAdapter = {
  async read(): Promise<ClipboardContent> {
    const t = await tool();
    if (!t) throw missing();
    return {
      text: await readType(t, 'text/plain'),
      html: await readType(t, 'text/html'),
    };
  },
  async write({ text, html }: ClipboardContent): Promise<void> {
    const t = await tool();
    if (!t) throw missing();
    if (t === 'copyq') {
      const args = ['copy'];
      if (text != null) args.push('text/plain', text);
      if (html != null) args.push('text/html', html);
      await run('copyq', args);
      return;
    }
    const mime = html != null ? 'text/html' : 'text/plain';
    const body = html ?? text ?? '';
    if (t === 'wl') await run('wl-copy', ['--type', mime], body);
    else await run('xclip', ['-selection', 'clipboard', '-t', mime], body);
  },
  async paste(): Promise<void> {
    if (process.env.WAYLAND_DISPLAY && (await has('wtype'))) await run('wtype', ['-M', 'ctrl', 'v', '-m', 'ctrl']);
    else if (await has('xdotool')) await run('xdotool', ['key', 'ctrl+v']);
    else throw new Error('Paste needs xdotool (X11) or wtype (Wayland).');
  },
};
