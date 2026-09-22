import { describe, expect, it } from 'vitest';
import { fromCfHtml, toCfHtml } from '../src/clipboard/win32.js';

describe('CF_HTML envelope', () => {
  it('computes byte offsets that point at the fragment', () => {
    const fragment = '<p>Grüße</p>';
    const cf = toCfHtml(fragment);
    const buf = Buffer.from(cf, 'utf8');
    const offset = (key: string) => Number(cf.match(new RegExp(`${key}:(\\d+)`))?.[1]);
    expect(buf.subarray(offset('StartFragment'), offset('EndFragment')).toString('utf8')).toBe(fragment);
    expect(buf.subarray(offset('StartHTML'), offset('EndHTML')).toString('utf8')).toMatch(/^<html>.*<\/html>$/s);
  });

  it('extracts the fragment back out', () => {
    expect(fromCfHtml(toCfHtml('<b>x</b>'))).toBe('<b>x</b>');
  });
});
