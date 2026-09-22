// A terminal that renders markdown destroys it: Claude Code, bat and friends draw tables with
// box-drawing characters, so the clipboard holds art, not syntax. Turn that art back into a
// markdown table before anything else looks at the text.

const VERTICAL = /[│┃║]/; // │ ┃ ║
const BORDER_ONLY = /^[\s─-╿\-+=]+$/; // a rule made of box-drawing pieces
const HEADING_RULE = /^[\s─━═=-]+$/; // the header separator inside a table

const isBorder = (line: string) => BORDER_ONLY.test(line) && line.trim().length > 0;
const hasCells = (line: string) => VERTICAL.test(line);

function cellsOf(line: string): string[] {
  return line
    .replace(/^\s*[│┃║]/, '')
    .replace(/[│┃║]\s*$/, '')
    .split(VERTICAL)
    .map((c) => c.trim());
}

function toMarkdown(rows: string[][]): string[] {
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')];
  const [header, ...body] = rows;
  if (!header) return [];
  const out = [`| ${pad(header).join(' | ')} |`, `| ${Array(width).fill('---').join(' | ')} |`];
  for (const row of body) out.push(`| ${pad(row).join(' | ')} |`);
  return out;
}

/** Rewrite box-drawn tables as GFM tables. Text without them comes back untouched. */
export function repairBoxTables(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let rows: string[][] = [];

  const flush = () => {
    if (rows.length) out.push(...toMarkdown(rows));
    rows = [];
  };

  for (const line of lines) {
    if (hasCells(line)) {
      const cells = cellsOf(line);
      // The ---- row inside a box table is a separator, not data.
      if (cells.some((c) => c.length > 0) && !cells.every((c) => c === '' || HEADING_RULE.test(c))) {
        rows.push(cells);
      }
      continue;
    }
    if (isBorder(line) && (rows.length > 0 || isTableStart(lines, line))) continue;
    flush();
    out.push(line);
  }
  flush();
  return out.join('\n');
}

// A border line only belongs to a table if a cell row follows it.
function isTableStart(lines: string[], border: string): boolean {
  const i = lines.indexOf(border);
  return i >= 0 && lines.slice(i + 1, i + 3).some(hasCells);
}
