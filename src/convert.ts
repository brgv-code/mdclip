import { marked } from 'marked';
import TurndownService from 'turndown';
import turndownPluginGfm from 'turndown-plugin-gfm';

marked.use({ gfm: true, breaks: false });

export function mdToHtml(markdown: string): string {
  return (marked.parse(markdown) as string).trim();
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '_',
  strongDelimiter: '**',
});
turndown.use(turndownPluginGfm.gfm);
// Drop editor chrome that has no markdown equivalent.
turndown.remove(['style', 'script', 'meta', 'title']);
// Turndown pads list markers to four columns ("-   item"); use the common two-space form instead.
turndown.addRule('listItem', {
  filter: 'li',
  replacement: (content, node, options) => {
    const body = content.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/\n/gm, '\n  ');
    const parent = node.parentNode as HTMLElement | null;
    let prefix = `${options.bulletListMarker} `;
    if (parent?.nodeName === 'OL') {
      const start = parent.getAttribute('start');
      const index = Array.prototype.indexOf.call(parent.children, node);
      prefix = `${start ? Number(start) + index : index + 1}. `;
    }
    return prefix + body + (node.nextSibling && !/\n$/.test(body) ? '\n' : '');
  },
});

export function htmlToMd(html: string): string {
  return turndown
    .turndown(html)
    .replace(/^(\s*(?:[-*]|\d+\.) \[[ x]\]) +/gm, '$1 ')
    .trim();
}
