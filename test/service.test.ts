import { describe, expect, it } from 'vitest';
import { argvFile, hotkeyFile, infoPlist } from '../src/service/bundle.js';
import { DEFAULT_CONFIG, formatHotkey, parseHotkey } from '../src/service/config.js';
import { flagMask, keycodeFor } from '../src/service/keycodes.js';
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

  it('repairs a terminal-rendered table before converting', () => {
    const r = enrich({ text: '┌───┬───┐\n│ a │ b │\n├───┼───┤\n│ 1 │ 2 │\n└───┴───┘' });
    expect(r?.content.text).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(r?.content.html).toContain('<table>');
  });

  it('returns null for an empty clipboard', () => {
    expect(enrich({ text: '  ', html: null })).toBeNull();
  });
});

describe('plist', () => {
  it('runs the bundled applet and escapes paths', () => {
    const p = plist('/Users/x/a&b/mdclip.app/Contents/MacOS/applet');
    expect(p).toContain('<string>/Users/x/a&amp;b/mdclip.app/Contents/MacOS/applet</string>');
    expect(p).toContain('<key>RunAtLoad</key>');
  });
});

describe('bundle', () => {
  it('writes one argument per line for the launcher', () => {
    expect(argvFile('/opt/node', '/Users/x/cli.js')).toBe('/opt/node\n/Users/x/cli.js\nlisten\n');
    expect(() => argvFile('/opt/no\nde', '/x')).toThrow(/newline/);
  });

  it('writes the hotkey for the launcher tap', () => {
    expect(hotkeyFile(8, 0x60000)).toBe('8 393216\n');
  });

  it('declares a background-only app bundle', () => {
    const p = infoPlist('0.1.0');
    expect(p).toContain('<string>dev.mdclip.listener</string>');
    expect(p).toContain('<key>LSUIElement</key>');
    expect(p).toContain('<string>0.1.0</string>');
  });
});

describe('defaults', () => {
  it('ships a swallowable hotkey and audible feedback', () => {
    expect(DEFAULT_CONFIG).toEqual({ hotkey: 'ctrl+shift+c', notify: true, sound: 'Tink' });
  });
});

describe('keycodes', () => {
  it('maps keys to macOS virtual keycodes', () => {
    expect(keycodeFor('c')).toBe(8);
    expect(keycodeFor('V')).toBe(9);
    expect(keycodeFor('f5')).toBe(96);
    expect(() => keycodeFor('enter')).toThrow(/Unsupported key/);
  });

  it('builds the CGEventFlags mask', () => {
    expect(flagMask(parseHotkey('ctrl+shift+c'))).toBe(0x40000 | 0x20000);
    expect(flagMask(parseHotkey('cmd+alt+m'))).toBe(0x100000 | 0x80000);
    expect(flagMask(parseHotkey('shift+f1'))).toBe(0x20000);
  });
});
