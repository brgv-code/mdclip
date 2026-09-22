import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface Config {
  hotkey: string;
  notify: boolean;
  /** A sound always plays; notifications are posted by osascript and some systems suppress those. */
  sound: string | false;
}

export const CONFIG_PATH = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'mdclip', 'config.json');

// Ctrl+Shift+C by default: the hook cannot swallow keystrokes, and Cmd+Shift+C is Chrome's "inspect element".
export const DEFAULT_CONFIG: Config = { hotkey: 'ctrl+shift+c', notify: true, sound: 'Tink' };

export function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) return DEFAULT_CONFIG;
  const parsed = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as Partial<Config>;
  return { ...DEFAULT_CONFIG, ...parsed };
}

export interface Hotkey {
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
  alt: boolean;
  key: string;
}

const MODIFIERS: Record<string, keyof Omit<Hotkey, 'key'>> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  shift: 'shift',
  cmd: 'meta',
  command: 'meta',
  meta: 'meta',
  super: 'meta',
  win: 'meta',
  alt: 'alt',
  option: 'alt',
  opt: 'alt',
};

export function parseHotkey(spec: string): Hotkey {
  const hotkey: Hotkey = { ctrl: false, shift: false, meta: false, alt: false, key: '' };
  for (const raw of spec.toLowerCase().split('+')) {
    const part = raw.trim();
    const mod = MODIFIERS[part];
    if (mod) hotkey[mod] = true;
    else if (/^[a-z0-9]$/.test(part) || /^f\d{1,2}$/.test(part)) hotkey.key = part;
    else throw new Error(`Unsupported key in hotkey "${spec}": "${part}"`);
  }
  if (!hotkey.key) throw new Error(`Hotkey "${spec}" needs a non-modifier key, e.g. ctrl+shift+c`);
  if (!hotkey.ctrl && !hotkey.shift && !hotkey.meta && !hotkey.alt) {
    throw new Error(`Hotkey "${spec}" needs at least one modifier`);
  }
  return hotkey;
}

export function formatHotkey(h: Hotkey): string {
  const parts = [h.ctrl && 'Ctrl', h.alt && 'Option', h.shift && 'Shift', h.meta && 'Cmd', h.key.toUpperCase()];
  return parts.filter(Boolean).join('+');
}
