import { describe, expect, it } from 'vitest';
import { formatHotkey, parseHotkey } from '../src/service/config.js';
import { plist } from '../src/service/launchd.js';
import { enrich } from '../src/service/smart-copy.js';

describe('parseHotkey', () => {
  it('parses modifiers and key', () => {
    expect(parseHotkey('ctrl+shift+c')).toEqual({ ctrl: true, shift: true, meta: false, alt: false, key: 'c' });
    expect(parseHotkey('Cmd+Option+M')).toEqual({ ctrl: false, shift: false, meta: true, alt: true, key: 'm' });
  });

  it('rejects hotkeys without a modifier or key', () => {
    expect(() => parseHotkey('c')).toThrow(/modifier/);
    expect(() => parseHotkey('ctrl+shift')).toThrow(/non-modifier/);
    expect(() => parseHotkey('ctrl+enter')).toThrow(/Unsupported/);
  });

  it('formats for humans', () => {
    expect(formatHotkey(parseHotkey('ctrl+shift+c'))).toBe('Ctrl+Shift+C');
  });
});

describe('enrich', () => {
  it('adds html when only markdown text is present', () => {
    const r = enrich({ text: '# Hi\n\n- a' });
    expect(r?.direction).toBe('md-to-rich');
    expect(r?.content.text).toBe('# Hi\n\n- a');
    expect(r?.content.html).toContain('<h1>Hi</h1>');
  });

  it('replaces the plain flavor with markdown when html is present', () => {
    const r = enrich({ text: 'Hi\na', html: '<h1>Hi</h1><ul><li>a</li></ul>', rtf: '{\\rtf1}' });
    expect(r?.direction).toBe('rich-to-md');
    expect(r?.content.text).toBe('# Hi\n\n- a');
    expect(r?.content.html).toBe('<h1>Hi</h1><ul><li>a</li></ul>');
    expect(r?.content.rtf).toBe('{\\rtf1}');
  });

  it('returns null for an empty clipboard', () => {
    expect(enrich({ text: '  ', html: null })).toBeNull();
  });
});

describe('plist', () => {
  it('runs node with the cli in listen mode and escapes paths', () => {
    const p = plist('/usr/local/bin/node', '/Users/x/a&b/cli.js');
    expect(p).toContain('<string>/usr/local/bin/node</string>');
    expect(p).toContain('<string>/Users/x/a&amp;b/cli.js</string>');
    expect(p).toContain('<string>listen</string>');
    expect(p).toContain('<key>RunAtLoad</key>');
  });
});
