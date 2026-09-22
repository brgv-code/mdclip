import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { run } from '../clipboard/exec.js';
import { buildBundle, removeBundle } from './bundle.js';

export const LABEL = 'dev.mdclip.listen';
const PLIST = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
export const LOG = join(homedir(), 'Library', 'Logs', 'mdclip.log');

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function plist(program: string): string {
  const args = [program].map((a) => `    <string>${escapeXml(a)}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(LOG)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(LOG)}</string>
</dict>
</plist>
`;
}

const domain = () => `gui/${process.getuid?.() ?? 501}`;

async function launchctl(...args: string[]) {
  return run('launchctl', args);
}

export async function install(cliPath: string, version: string): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('mdclip service is macOS only for now.');
  mkdirSync(join(homedir(), 'Library', 'LaunchAgents'), { recursive: true });
  mkdirSync(join(homedir(), 'Library', 'Logs'), { recursive: true });
  if (existsSync(PLIST)) {
    await launchctl('bootout', `${domain()}/${LABEL}`);
    // bootout returns before the job is gone; bootstrap fails if it is still loaded.
    for (let i = 0; i < 20 && (await launchctl('print', `${domain()}/${LABEL}`)).code === 0; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const program = await buildBundle(process.execPath, cliPath, version);
  writeFileSync(PLIST, plist(program));
  const res = await launchctl('bootstrap', domain(), PLIST);
  if (res.code !== 0) throw new Error(`launchctl bootstrap failed: ${res.stderr.trim() || res.stdout.trim()}`);
}

export async function uninstall(): Promise<boolean> {
  if (!existsSync(PLIST)) return false;
  await launchctl('bootout', `${domain()}/${LABEL}`);
  unlinkSync(PLIST);
  removeBundle();
  return true;
}

export async function status(): Promise<{ installed: boolean; running: boolean; pid: number | null }> {
  if (!existsSync(PLIST)) return { installed: false, running: false, pid: null };
  const res = await launchctl('print', `${domain()}/${LABEL}`);
  const pid = res.stdout.match(/^\s*pid = (\d+)/m)?.[1];
  return { installed: true, running: res.code === 0 && pid !== undefined, pid: pid ? Number(pid) : null };
}

export async function restart(): Promise<void> {
  await launchctl('kickstart', '-k', `${domain()}/${LABEL}`);
}
