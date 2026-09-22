import { execFile } from 'node:child_process';

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Run a binary with optional stdin, never throws on non-zero exit. */
export function run(cmd: string, args: string[], stdin?: string): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' }, (err, stdout, stderr) => {
      const code = err && 'code' in err && typeof err.code === 'number' ? err.code : err ? 1 : 0;
      resolve({ stdout, stderr, code });
    });
    if (stdin !== undefined) child.stdin?.end(stdin);
    else child.stdin?.end();
  });
}

export async function has(cmd: string): Promise<boolean> {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return (await run(probe, [cmd])).code === 0;
}
