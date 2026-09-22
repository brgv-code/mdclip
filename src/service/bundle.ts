import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../clipboard/exec.js';

// macOS lists app bundles in Privacy & Security, not bare binaries, and attributes a bundle's
// grant to its child processes. The prebuilt launcher (native/launcher.c) is the bundle's main
// executable; it spawns node as a child, so the Accessibility entry is "mdclip".

export const APP_DIR = join(homedir(), 'Library', 'Application Support', 'mdclip');
export const APP = join(APP_DIR, 'mdclip.app');
export const APP_EXECUTABLE = join(APP, 'Contents', 'MacOS', 'mdclip');
export const BUNDLE_ID = 'dev.mdclip.listener';
const LAUNCHER = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'native', 'mdclip-launcher');

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function infoPlist(version: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>mdclip</string>
  <key>CFBundleIdentifier</key>
  <string>${BUNDLE_ID}</string>
  <key>CFBundleName</key>
  <string>mdclip</string>
  <key>CFBundleDisplayName</key>
  <string>mdclip</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${escapeXml(version)}</string>
  <key>CFBundleVersion</key>
  <string>${escapeXml(version)}</string>
  <key>LSUIElement</key>
  <true/>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
</dict>
</plist>
`;
}

/** One argument per line, read by the launcher. */
export function argvFile(nodePath: string, cliPath: string): string {
  for (const p of [nodePath, cliPath]) {
    if (p.includes('\n')) throw new Error(`Path contains a newline: ${p}`);
  }
  return `${nodePath}\n${cliPath}\nlisten\n`;
}

async function must(cmd: string, args: string[]): Promise<void> {
  const res = await run(cmd, args);
  if (res.code !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${res.stderr.trim() || res.stdout.trim()}`);
}

export async function buildBundle(nodePath: string, cliPath: string, version: string): Promise<string> {
  if (!existsSync(LAUNCHER)) throw new Error(`Launcher binary missing at ${LAUNCHER}. Reinstall mdclip.`);
  if (existsSync(APP)) rmSync(APP, { recursive: true, force: true });
  mkdirSync(join(APP, 'Contents', 'MacOS'), { recursive: true });
  mkdirSync(join(APP, 'Contents', 'Resources'), { recursive: true });
  writeFileSync(join(APP, 'Contents', 'Info.plist'), infoPlist(version));
  writeFileSync(join(APP, 'Contents', 'Resources', 'argv'), argvFile(nodePath, cliPath));
  copyFileSync(LAUNCHER, APP_EXECUTABLE);
  chmodSync(APP_EXECUTABLE, 0o755);
  // Ad-hoc signature: TCC identifies the bundle by it. Re-signing on every install means a
  // re-grant after upgrades; a Developer ID signature would make it stable.
  await must('codesign', ['--force', '--deep', '--sign', '-', APP]);
  return APP_EXECUTABLE;
}

export function removeBundle(): void {
  rmSync(APP_DIR, { recursive: true, force: true });
}
