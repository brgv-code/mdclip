import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { run } from '../clipboard/exec.js';

// macOS only lists app bundles in Privacy & Security, not bare binaries. A tiny AppleScript applet
// (built with osacompile, no compiler needed) runs node as its child, so the Accessibility entry is
// "mdclip" and children like node and osascript inherit the grant.

export const APP_DIR = join(homedir(), 'Library', 'Application Support', 'mdclip');
export const APP = join(APP_DIR, 'mdclip.app');
export const APP_EXECUTABLE = join(APP, 'Contents', 'MacOS', 'applet');
const BUNDLE_ID = 'dev.mdclip.listener';

const asString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export function appleScript(nodePath: string, cliPath: string, logPath: string): string {
  // do shell script swallows the child's output, so redirect it to the log ourselves.
  // try/end try: a crashed child must not pop an applet error dialog; launchd restarts us instead.
  const cmd = `"exec " & quoted form of ${asString(nodePath)} & " " & quoted form of ${asString(cliPath)} & " listen >> " & quoted form of ${asString(logPath)} & " 2>&1"`;
  return `try
  do shell script ${cmd}
end try
`;
}

async function must(cmd: string, args: string[]): Promise<void> {
  const res = await run(cmd, args);
  if (res.code !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${res.stderr.trim() || res.stdout.trim()}`);
}

export async function buildBundle(nodePath: string, cliPath: string, logPath: string): Promise<string> {
  mkdirSync(APP_DIR, { recursive: true });
  const script = join(APP_DIR, 'listener.applescript');
  writeFileSync(script, appleScript(nodePath, cliPath, logPath));
  if (existsSync(APP)) rmSync(APP, { recursive: true, force: true });
  await must('osacompile', ['-o', APP, script]);
  const info = join(APP, 'Contents', 'Info.plist');
  const set = (key: string, type: string, value: string) =>
    run('/usr/libexec/PlistBuddy', ['-c', `Delete :${key}`, info]).then(() =>
      must('/usr/libexec/PlistBuddy', ['-c', `Add :${key} ${type} ${value}`, info]),
    );
  await set('CFBundleIdentifier', 'string', BUNDLE_ID);
  await set('CFBundleName', 'string', 'mdclip');
  await set('CFBundleDisplayName', 'string', 'mdclip');
  await set('LSUIElement', 'bool', 'true');
  // Ad-hoc signature: enough for TCC to identify the bundle stably.
  await must('codesign', ['--force', '--deep', '--sign', '-', APP]);
  return APP_EXECUTABLE;
}

export function removeBundle(): void {
  rmSync(APP_DIR, { recursive: true, force: true });
}
