import { describe, expect, it } from 'vitest';
import { repairBoxTables } from '../src/terminal-tables.js';

describe('repairBoxTables', () => {
  it('converts a box-drawn table back to markdown', () => {
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

  it('keeps surrounding prose and handles several tables', () => {
    const src = ['Before', '│ a │ b │', '│ 1 │ 2 │', 'Between', '│ x │', '│ y │', 'After'].join('\n');
    expect(repairBoxTables(src)).toBe(
      ['Before', '| a | b |', '| --- | --- |', '| 1 | 2 |', 'Between', '| x |', '| --- |', '| y |', 'After'].join('\n'),
    );
  });

  it('pads short rows to the widest row', () => {
    expect(repairBoxTables('│ a │ b │\n│ 1 │')).toBe('| a | b |\n| --- | --- |\n| 1 |  |');
  });

  it('leaves ordinary markdown alone', () => {
    const md = '# Title\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n- item';
    expect(repairBoxTables(md)).toBe(md);
  });

  it('leaves prose with a stray dash rule alone', () => {
    expect(repairBoxTables('Heading\n-------\ntext')).toBe('Heading\n-------\ntext');
  });
});
