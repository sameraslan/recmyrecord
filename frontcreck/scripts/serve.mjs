/** Starts `next start` for the built app on `port` and resolves once it answers. Refuses a port that is already
 * serving, so a stale server from an older build is never measured, and stops the real `next` process (not an
 * `npx` wrapper that would leave it running). */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

async function answers(base) {
  try {
    return (await fetch(base)).ok;
  } catch {
    return false; // connection refused: nothing is listening yet
  }
}

export async function startServer(port) {
  if (!fs.existsSync(path.join(ROOT, '.next/BUILD_ID'))) throw new Error('no production build: run npm run build first');
  const base = `http://127.0.0.1:${port}`;
  if (await answers(base)) throw new Error(`port ${port} is already serving; stop that server first`);
  const child = spawn(path.join(ROOT, 'node_modules/.bin/next'), ['start', '--port', String(port)], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  const stop = () =>
    new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
    });
  for (let i = 0; i < 120; i++) {
    if (await answers(base)) return { base, stop };
    await new Promise((r) => setTimeout(r, 500));
  }
  await stop();
  throw new Error('next start did not come up');
}
