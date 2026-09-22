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
        '| Stay on the main DB | None. Already done. |',
        '| Option 2 (connection string) | One secret per environment, plus a permanent second DB connection in the worker |',
        '| Option 1 (Hyperdrive) | Option 2, plus provisioning Hyperdrive configs |',
        '| Option 3 (Studio owns it) | Rewrite, and R2 moves to the CMS worker |',
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
