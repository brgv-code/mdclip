import { darwin } from './darwin.js';
import { linux } from './linux.js';
import type { ClipboardAdapter } from './types.js';
import { win32 } from './win32.js';

export type { ClipboardAdapter, ClipboardContent } from './types.js';

export function clipboard(): ClipboardAdapter {
  switch (process.platform) {
    case 'darwin':
      return darwin;
    case 'linux':
      return linux;
    case 'win32':
      return win32;
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}
