import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repairBoxTables } from '../src/terminal-tables.js';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8');

describe('repairBoxTables', () => {
  it('rebuilds a real Claude Code table, joining cells the renderer wrapped', () => {
    expect(repairBoxTables(fixture('claude-code-table.txt')).trim()).toBe(
      [
        '|  | Setup cost |',
        '| --- | --- |',
        '| Keep one database | None. Already done. |',
        '| Add a connection pooler (managed) | One secret per environment, plus a permanent second connection in the worker |',
        '| Split into two services | The pooler work, plus provisioning configs |',
      ].join('\n'),
    );
  });

  it('converts a simple box table', () => {
    const rendered = [
      '┌─────────────┬──────────────┐',
      '│ Option      │ Setup cost   │',
      '├─────────────┼──────────────┤',
      '│ Main DB     │ None         │',
      '│ Hyperdrive  │ One secret   │',
      '└─────────────┴──────────────┘',
    ].join('\n');
    expect(repairBoxTables(rendered)).toBe(
      ['| Option | Setup cost |', '| --- | --- |', '| Main DB | None |', '| Hyperdrive | One secret |'].join('\n'),
    );
  });

  it('keeps one row per line when only the header has a rule', () => {
    const rendered = ['│ a │ b │', '├───┼───┤', '│ 1 │ 2 │', '│ 3 │ 4 │'].join('\n');
    expect(repairBoxTables(rendered)).toBe(['| a | b |', '| --- | --- |', '| 1 | 2 |', '| 3 | 4 |'].join('\n'));
  });

  it('keeps surrounding prose', () => {
    const src = ['Before', '┌───┐', '│ a │', '├───┤', '│ 1 │', '└───┘', 'After'].join('\n');
    expect(repairBoxTables(src)).toBe(['Before', '| a |', '| --- |', '| 1 |', 'After'].join('\n'));
  });

  it('leaves ordinary markdown and prose alone', () => {
    const md = '# Title\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n- item';
    expect(repairBoxTables(md)).toBe(md);
    expect(repairBoxTables('Heading\n-------\ntext')).toBe('Heading\n-------\ntext');
  });
});
