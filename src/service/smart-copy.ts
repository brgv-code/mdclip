import type { ClipboardContent } from '../clipboard/types.js';
import { htmlToMd, mdToHtml } from '../convert.js';

export type Enriched = { content: ClipboardContent; direction: 'md-to-rich' | 'rich-to-md' } | null;

/** Fill in the missing flavors so every target app finds one it understands. */
export function enrich(content: ClipboardContent): Enriched {
  const html = content.html?.trim();
  if (html) {
    return { content: { ...content, text: htmlToMd(html) }, direction: 'rich-to-md' };
  }
  const text = content.text?.trim();
  if (!text) return null;
  return { content: { text: content.text ?? text, html: mdToHtml(text), rtf: null }, direction: 'md-to-rich' };
}
