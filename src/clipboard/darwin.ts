import { run } from './exec.js';
import type { ClipboardAdapter, ClipboardContent } from './types.js';

// JXA + ObjC bridge gives full NSPasteboard access with no native module.
const READ_SCRIPT = `
ObjC.import('AppKit');
function run() {
  const pb = $.NSPasteboard.generalPasteboard;
  const get = (t) => { const s = pb.stringForType(t); return s.isNil() ? null : s.js; };
  return JSON.stringify({
    text: get('public.utf8-plain-text'),
    html: get('public.html'),
    rtf: get('public.rtf'),
  });
}`;

const WRITE_SCRIPT = `
ObjC.import('AppKit');
function run() {
  const data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
  const p = JSON.parse($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js);
  const pb = $.NSPasteboard.generalPasteboard;
  pb.clearContents;
  if (p.text != null) pb.setStringForType($(p.text), 'public.utf8-plain-text');
  if (p.html != null) pb.setStringForType($(p.html), 'public.html');
  if (p.rtf != null) pb.setStringForType($(p.rtf), 'public.rtf');
  return 'ok';
}`;

async function jxa(script: string, stdin?: string): Promise<string> {
  const res = await run('osascript', ['-l', 'JavaScript', '-e', script], stdin);
  if (res.code !== 0) throw new Error(`osascript failed: ${res.stderr.trim()}`);
  return res.stdout.trim();
}

export async function htmlToRtf(html: string): Promise<string | null> {
  const res = await run(
    'textutil',
    ['-stdin', '-stdout', '-format', 'html', '-convert', 'rtf', '-inputencoding', 'UTF-8'],
    `<meta charset="utf-8">${html}`,
  );
  return res.code === 0 && res.stdout ? res.stdout : null;
}

// Copy, wait for the app to write the pasteboard, and read it back, all in one osascript.
// Polling from Node costs a process spawn per tick (~70 ms), which dominated the whole operation.
const COPY_AND_READ_SCRIPT = `
ObjC.import('AppKit');
function run() {
  const pb = $.NSPasteboard.generalPasteboard;
  const before = pb.changeCount;
  Application('System Events').keystroke('c', { using: 'command down' });
  const deadline = Date.now() + 400;  // apps write the pasteboard within ~150 ms
  while (Date.now() < deadline && pb.changeCount === before) $.NSThread.sleepForTimeInterval(0.02);
  const get = (t) => { const s = pb.stringForType(t); return s.isNil() ? null : s.js; };
  return JSON.stringify({
    changed: pb.changeCount !== before,
    text: get('public.utf8-plain-text'),
    html: get('public.html'),
    rtf: get('public.rtf'),
  });
}`;

const COUNT_SCRIPT = `
ObjC.import('AppKit');
function run() { return String($.NSPasteboard.generalPasteboard.changeCount); }`;

export const darwin: ClipboardAdapter & {
  changeCount(): Promise<number>;
  copy(): Promise<void>;
  copyAndRead(): Promise<ClipboardContent & { changed: boolean }>;
  notify(title: string, body: string): Promise<void>;
} = {
  async read(): Promise<ClipboardContent> {
    return JSON.parse(await jxa(READ_SCRIPT)) as ClipboardContent;
  },
  async write(content: ClipboardContent): Promise<void> {
    await jxa(WRITE_SCRIPT, JSON.stringify(content));
  },
  async paste(): Promise<void> {
    await keystroke('v');
  },
  async copy(): Promise<void> {
    await keystroke('c');
  },
  /** Cmd+C then read, in a single subprocess. `changed` is false when nothing was selected. */
  async copyAndRead(): Promise<ClipboardContent & { changed: boolean }> {
    return JSON.parse(await jxa(COPY_AND_READ_SCRIPT)) as ClipboardContent & { changed: boolean };
  },
  async changeCount(): Promise<number> {
    return Number(await jxa(COUNT_SCRIPT));
  },
  async notify(title: string, body: string): Promise<void> {
    const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    await run('osascript', ['-e', `display notification "${q(body)}" with title "${q(title)}"`]);
  },
};

/** Accessibility permission for the responsible process. `prompt` opens the System Settings dialog. */
export async function accessibilityTrusted(prompt: boolean): Promise<boolean> {
  const script = `ObjC.import('ApplicationServices'); $.AXIsProcessTrustedWithOptions($({ AXTrustedCheckOptionPrompt: ${prompt} }))`;
  return (await run('osascript', ['-l', 'JavaScript', '-e', script])).stdout.trim() === 'true';
}

export async function playSound(name: string): Promise<void> {
  await run('afplay', [`/System/Library/Sounds/${name}.aiff`]);
}

async function keystroke(key: string): Promise<void> {
  const res = await run('osascript', [
    '-e',
    `tell application "System Events" to keystroke "${key}" using command down`,
  ]);
  if (res.code !== 0) {
    throw new Error(
      `Could not send Cmd+${key.toUpperCase()}. Grant Accessibility access to the process. ${res.stderr.trim()}`,
    );
  }
}
