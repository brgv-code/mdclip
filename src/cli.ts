#!/usr/bin/env node
import { fstatSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { htmlToRtf } from './clipboard/darwin.js';
import { clipboard } from './clipboard/index.js';
import { htmlToMd, mdToHtml } from './convert.js';
import { CONFIG_PATH, DEFAULT_CONFIG, loadConfig } from './service/config.js';
import * as launchd from './service/launchd.js';
import { repairBoxTables } from './terminal-tables.js';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

const HELP = `mdclip ${version}
Copy markdown as rich text, and rich text as markdown.

Usage
  mdclip [rich] [file]   markdown -> clipboard as text + html + rtf  (default)
  mdclip md [file]       html on the clipboard -> markdown

Input comes from the file argument, from a pipe, or from the clipboard.

Always-on hotkey (macOS)
  mdclip service install   start at login; press the hotkey instead of Cmd+C to copy with all flavors
  mdclip service status | restart | uninstall | log
  mdclip listen            run the hotkey listener in the foreground (for trying it out)
  Default hotkey ctrl+shift+c, change it in ${CONFIG_PATH}

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
  command: 'rich' | 'md' | 'listen' | 'service';
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
    else if (arg === 'rich' || arg === 'md' || arg === 'listen' || arg === 'service') opts.command = arg;
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

async function service(action: string | null): Promise<void> {
  const cliPath = new URL(import.meta.url).pathname;
  switch (action) {
    case 'install': {
      await launchd.install(cliPath, version);
      const config = loadConfig();
      process.stderr.write(
        `Installed. Press ${config.hotkey} instead of Cmd+C to copy with every flavor.\n` +
          'macOS now asks for Accessibility access for "mdclip". Allow it; the listener picks it up by itself.\n' +
          `Config: ${CONFIG_PATH} (default ${JSON.stringify(DEFAULT_CONFIG)})\nLog: ${launchd.LOG}\n`,
      );
      return;
    }
    case 'uninstall':
      process.stderr.write((await launchd.uninstall()) ? 'Uninstalled.\n' : 'Not installed.\n');
      return;
    case 'restart':
      await launchd.restart();
      process.stderr.write('Restarted.\n');
      return;
    case 'status': {
      const s = await launchd.status();
      process.stdout.write(
        s.installed ? `installed, ${s.running ? `running (pid ${s.pid})` : 'not running'}\n` : 'not installed\n',
      );
      return;
    }
    case 'log':
      process.stdout.write(`${launchd.LOG}\n`);
      return;
    default:
      fail('Usage: mdclip service <install|uninstall|restart|status|log>');
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.command === 'listen') {
    const { listen } = await import('./service/listen.js');
    return listen();
  }
  if (opts.command === 'service') return service(opts.file);
  const input = await readInput(opts);
  const cb = clipboard();

  if (opts.command === 'rich') {
    const markdown = repairBoxTables(input.text ?? '').trim();
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
