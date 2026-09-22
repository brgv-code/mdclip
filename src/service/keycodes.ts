import type { Hotkey } from './config.js';

// macOS virtual keycodes (kVK_ANSI_*), which is what a CGEvent reports.
const KEYS: Record<string, number> = {
  a: 0,
  s: 1,
  d: 2,
  f: 3,
  h: 4,
  g: 5,
  z: 6,
  x: 7,
  c: 8,
  v: 9,
  b: 11,
  q: 12,
  w: 13,
  e: 14,
  r: 15,
  y: 16,
  t: 17,
  '1': 18,
  '2': 19,
  '3': 20,
  '4': 21,
  '6': 22,
  '5': 23,
  '9': 25,
  '7': 26,
  '8': 28,
  '0': 29,
  o: 31,
  u: 32,
  i: 34,
  p: 35,
  l: 37,
  j: 38,
  k: 40,
  n: 45,
  m: 46,
  f1: 122,
  f2: 120,
  f3: 99,
  f4: 118,
  f5: 96,
  f6: 97,
  f7: 98,
  f8: 100,
  f9: 101,
  f10: 109,
  f11: 103,
  f12: 111,
};

// CGEventFlags
const FLAG = { shift: 0x20000, control: 0x40000, alt: 0x80000, command: 0x100000 };

export function keycodeFor(key: string): number {
  const code = KEYS[key.toLowerCase()];
  if (code === undefined) throw new Error(`Unsupported key "${key}". Try a letter, a digit, or f1-f12.`);
  return code;
}

export function flagMask(hotkey: Hotkey): number {
  return (
    (hotkey.shift ? FLAG.shift : 0) |
    (hotkey.ctrl ? FLAG.control : 0) |
    (hotkey.alt ? FLAG.alt : 0) |
    (hotkey.meta ? FLAG.command : 0)
  );
}
