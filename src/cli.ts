#!/usr/bin/env node
import { fstatSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { htmlToRtf } from './clipboard/darwin.js';
import { clipboard } from './clipboard/index.js';
import { htmlToMd, mdToHtml } from './convert.js';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

const HELP = `mdclip ${version}
Copy markdown as rich text, and rich text as markdown.

Usage
  mdclip [rich] [file]   markdown -> clipboard as text + html + rtf  (default)
  mdclip md [file]       html on the clipboard -> markdown

Input comes from the file argument, from a pipe, or from the clipboard.

Options
  -c, --clipboard   read the clipboard even when stdin is a pipe
  -o, --stdout      print the converted result instead of writing the clipboard
  --paste           send the paste keystroke after writing (macOS: needs Accessibility access)
  --no-rtf          skip the RTF flavor (macOS)
  -h, --help        show this help
  -v, --version     show the version

Examples
  pbpaste | mdclip            convert what you just copied, in place
  mdclip rich notes.md        copy a file as rich text
  mdclip md -o > page.md      turn copied rich text into a markdown file
`;

interface Options {
  command: 'rich' | 'md';
  file: string | null;
  fromClipboard: boolean;
  stdout: boolean;
  paste: boolean;
  rtf: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { command: 'rich', file: null, fromClipboard: false, stdout: false, paste: false, rtf: true };
  for (const arg of argv) {
    if (arg === '-h' || arg === '--help') {
      process.stdout.write(HELP);
      process.exit(0);
    } else if (arg === '-v' || arg === '--version') {
      process.stdout.write(`${version}\n`);
      process.exit(0);
    } else if (arg === '-c' || arg === '--clipboard') opts.fromClipboard = true;
    else if (arg === '-o' || arg === '--stdout') opts.stdout = true;
    else if (arg === '--paste') opts.paste = true;
    else if (arg === '--no-rtf') opts.rtf = false;
    else if (arg === 'rich' || arg === 'md') opts.command = arg;
    else if (arg === '-' || !arg.startsWith('-')) opts.file = arg;
    else fail(`Unknown option: ${arg}\n\n${HELP}`);
  }
  return opts;
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function stdinHasData(): boolean {
  try {
    const stat = fstatSync(0);
    return stat.isFIFO() || stat.isFile();
  } catch {
    return false;
  }
}

async function readInput(opts: Options): Promise<{ source: string; text: string | null; html: string | null }> {
  if (opts.file === '-' || (opts.file === null && !opts.fromClipboard && stdinHasData())) {
    const data = readFileSync(0, 'utf8');
    return { source: 'stdin', text: data, html: data };
  }
  if (opts.file) {
    const data = readFileSync(opts.file, 'utf8');
    return { source: opts.file, text: data, html: data };
  }
  const content = await clipboard().read();
  return { source: 'clipboard', text: content.text ?? null, html: content.html ?? null };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const input = await readInput(opts);
  const cb = clipboard();

  if (opts.command === 'rich') {
    const markdown = input.text?.trim();
    if (!markdown) fail(`Nothing to convert: no text found on ${input.source}.`);
    const html = mdToHtml(markdown);
    if (opts.stdout) {
      process.stdout.write(`${html}\n`);
      return;
    }
    const rtf = opts.rtf && process.platform === 'darwin' ? await htmlToRtf(html) : null;
    await cb.write({ text: markdown, html, rtf });
    const flavors = ['text', 'html', rtf ? 'rtf' : null].filter(Boolean).join(', ');
    process.stderr.write(`Copied as rich text (${flavors}) from ${input.source}.\n`);
  } else {
    const html = input.html?.trim();
    if (!html) fail(`Nothing to convert: no HTML found on ${input.source}. Copy from a rich editor first.`);
    const markdown = htmlToMd(html);
    if (opts.stdout) {
      process.stdout.write(`${markdown}\n`);
      return;
    }
    await cb.write({ text: markdown });
    process.stderr.write(`Copied as markdown from ${input.source}.\n`);
  }

  if (opts.paste) await cb.paste();
}

main().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
