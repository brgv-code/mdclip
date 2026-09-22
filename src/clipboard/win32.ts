import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './exec.js';
import type { ClipboardAdapter, ClipboardContent } from './types.js';

// Experimental: implemented against the CF_HTML spec but not exercised in CI yet. PRs welcome.

/** Wrap an HTML fragment in the CF_HTML envelope Windows expects (byte offsets, UTF-8). */
export function toCfHtml(fragment: string): string {
  const head =
    'Version:0.9\r\nStartHTML:AAAAAAAAAA\r\nEndHTML:BBBBBBBBBB\r\nStartFragment:CCCCCCCCCC\r\nEndFragment:DDDDDDDDDD\r\n';
  const pre = '<html><body><!--StartFragment-->';
  const post = '<!--EndFragment--></body></html>';
  const bytes = (s: string) => Buffer.byteLength(s, 'utf8');
  const startHtml = bytes(head);
  const startFrag = startHtml + bytes(pre);
  const endFrag = startFrag + bytes(fragment);
  const endHtml = endFrag + bytes(post);
  const pad = (n: number) => String(n).padStart(10, '0');
  return (
    head
      .replace('AAAAAAAAAA', pad(startHtml))
      .replace('BBBBBBBBBB', pad(endHtml))
      .replace('CCCCCCCCCC', pad(startFrag))
      .replace('DDDDDDDDDD', pad(endFrag)) +
    pre +
    fragment +
    post
  );
}

export function fromCfHtml(cf: string): string {
  const start = cf.indexOf('<!--StartFragment-->');
  const end = cf.indexOf('<!--EndFragment-->');
  if (start !== -1 && end !== -1) return cf.slice(start + '<!--StartFragment-->'.length, end);
  const lt = cf.indexOf('<');
  return lt === -1 ? cf : cf.slice(lt);
}

const WRITE_PS = `
$p = Get-Content -Raw -Encoding UTF8 $args[0] | ConvertFrom-Json
Add-Type -AssemblyName System.Windows.Forms
$d = New-Object System.Windows.Forms.DataObject
if ($null -ne $p.text) { $d.SetData([System.Windows.Forms.DataFormats]::UnicodeText, $p.text) }
if ($null -ne $p.html) {
  $ms = New-Object System.IO.MemoryStream(,[System.Text.Encoding]::UTF8.GetBytes($p.html))
  $d.SetData([System.Windows.Forms.DataFormats]::Html, $ms)
}
[System.Windows.Forms.Clipboard]::SetDataObject($d, $true)
`;

async function powershell(args: string[]): Promise<string> {
  const res = await run('powershell', ['-NoProfile', '-STA', '-NonInteractive', ...args]);
  if (res.code !== 0) throw new Error(`powershell failed: ${res.stderr.trim()}`);
  return res.stdout;
}

export const win32: ClipboardAdapter = {
  async read(): Promise<ClipboardContent> {
    const text = await powershell(['-Command', 'Get-Clipboard -Raw']);
    const cf = await powershell(['-Command', 'Get-Clipboard -TextFormatType Html -Raw']);
    return { text: text || null, html: cf ? fromCfHtml(cf) : null };
  },
  async write({ text, html }: ClipboardContent): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), 'mdclip-'));
    try {
      const payload = join(dir, 'payload.json');
      const script = join(dir, 'write.ps1');
      await writeFile(payload, JSON.stringify({ text, html: html != null ? toCfHtml(html) : null }), 'utf8');
      await writeFile(script, WRITE_PS, 'utf8');
      await powershell(['-ExecutionPolicy', 'Bypass', '-File', script, payload]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  async paste(): Promise<void> {
    await powershell([
      '-Command',
      "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')",
    ]);
  },
};
