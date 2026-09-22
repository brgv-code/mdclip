// A terminal that renders markdown destroys it: Claude Code, bat and friends draw tables with
// box-drawing characters, so the clipboard holds art, not syntax. Worse, a renderer wraps long
// cell text onto extra lines inside the box, so one logical row can span several lines.
// Turn that art back into a markdown table before anything else looks at the text.

const VERTICAL = /[│┃║|]/; // │ ┃ ║ |
const BOX = /[─-╿]/; // any box-drawing character
const RULE_ONLY = /^[\s─-╿+=-]+$/; // a horizontal rule made of box pieces

const isRule = (line: string) => RULE_ONLY.test(line) && BOX.test(line);
const isRow = (line: string) => VERTICAL.test(line) && BOX.test(line);

function cellsOf(line: string): string[] {
  return line
    .trim()
    .replace(/^[│┃║|]/, '')
    .replace(/[│┃║|]$/, '')
    .split(VERTICAL)
    .map((c) => c.trim());
}

/** Cell text wrapped over several lines: "in the" + "worker" -> "in the worker". */
function joinGroup(group: string[][]): string[] {
  const width = Math.max(...group.map((r) => r.length));
  const row: string[] = [];
  for (let i = 0; i < width; i++) {
    row.push(
      group
        .map((line) => line[i] ?? '')
        .filter((c) => c.length > 0)
        .join(' '),
    );
  }
  return row;
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

function renderBlock(block: string[]): string[] {
  const groups: string[][][] = [];
  let current: string[][] = [];
  for (const line of block) {
    if (isRule(line)) {
      if (current.length) groups.push(current);
      current = [];
      continue;
    }
    const cells = cellsOf(line);
    if (cells.some((c) => c.length > 0)) current.push(cells);
  }
  if (current.length) groups.push(current);
  if (!groups.length) return [];

  // With a rule between every row, each group is one logical row and wrapped lines belong together.
  // With only a header rule, there is nothing to group by, so every line is its own row.
  const rows = groups.length > 2 ? groups.map(joinGroup) : groups.flat();
  return toMarkdown(rows);
}

/** Rewrite box-drawn tables as GFM tables. Text without them comes back untouched. */
export function repairBoxTables(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let block: string[] = [];

  const flush = () => {
    if (block.length) out.push(...renderBlock(block));
    block = [];
  };

  for (const line of lines) {
    if (isRow(line) || (isRule(line) && block.length > 0)) {
      block.push(line);
      continue;
    }
    // A rule only starts a table when a row follows it.
    if (isRule(line)) {
      block.push(line);
      continue;
    }
    flush();
    out.push(line);
  }
  flush();
  return out.join('\n');
}
