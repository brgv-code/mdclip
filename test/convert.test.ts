import { describe, expect, it } from 'vitest';
import { htmlToMd, mdToHtml } from '../src/convert.js';

describe('mdToHtml', () => {
  it('renders GFM tables, task lists and fenced code', () => {
    const html = mdToHtml('| a | b |\n| - | - |\n| 1 | 2 |\n\n- [x] done\n\n```ts\nconst x = 1;\n```');
    expect(html).toContain('<table>');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('<pre><code class="language-ts">');
  });

  it('keeps non-ascii text', () => {
    expect(mdToHtml('Grüße')).toBe('<p>Grüße</p>');
  });
});

describe('htmlToMd', () => {
  it('uses atx headings, fenced code and two-space nested lists', () => {
    const md = htmlToMd('<h2>Title</h2><ul><li>one<ul><li>two</li></ul></li></ul><pre><code>x</code></pre>');
    expect(md).toBe('## Title\n\n- one\n  - two\n\n```\nx\n```');
  });

  it('converts tables and ordered lists', () => {
    const md = htmlToMd('<table><tr><th>a</th></tr><tr><td>1</td></tr></table><ol start="3"><li>x</li><li>y</li></ol>');
    expect(md).toContain('| a |\n| --- |\n| 1 |');
    expect(md).toContain('3. x\n4. y');
  });

  it('keeps a single space after task checkboxes', () => {
    expect(htmlToMd('<ul><li><input type="checkbox" disabled> task</li></ul>')).toBe('- [ ] task');
  });

  it('drops style and script blocks that editors add', () => {
    expect(htmlToMd('<style>p{}</style><p>hi</p><script>1</script>')).toBe('hi');
  });

  it('round-trips through mdToHtml', () => {
    const src = '# T\n\nSome **bold** and _em_.\n\n- a\n- b\n\n| c | d |\n| --- | --- |\n| 1 | 2 |';
    expect(htmlToMd(mdToHtml(src))).toBe(src);
  });
});
