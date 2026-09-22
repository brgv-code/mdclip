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

export const darwin: ClipboardAdapter = {
  async read(): Promise<ClipboardContent> {
    return JSON.parse(await jxa(READ_SCRIPT)) as ClipboardContent;
  },
  async write(content: ClipboardContent): Promise<void> {
    await jxa(WRITE_SCRIPT, JSON.stringify(content));
  },
  async paste(): Promise<void> {
    const res = await run('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down']);
    if (res.code !== 0) {
      throw new Error(`Could not send Cmd+V. Grant Accessibility access to your terminal. ${res.stderr.trim()}`);
    }
  },
};
