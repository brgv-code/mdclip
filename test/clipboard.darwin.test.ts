import { describe, expect, it } from 'vitest';
import { darwin, htmlToRtf } from '../src/clipboard/darwin.js';

// Touches the real system clipboard, so it only runs on macOS.
describe.runIf(process.platform === 'darwin')('darwin clipboard', () => {
  it('writes and reads text, html and rtf flavors', async () => {
    const rtf = await htmlToRtf('<p><b>x</b></p>');
    expect(rtf).toMatch(/^\{\\rtf1/);
    await darwin.write({ text: '# ü', html: '<h1>ü</h1>', rtf });
    const back = await darwin.read();
    expect(back.text).toBe('# ü');
    expect(back.html).toBe('<h1>ü</h1>');
    expect(back.rtf).toMatch(/^\{\\rtf1/);
  });
});
