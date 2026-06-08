import * as moduleApi from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const esmHooksSupported = typeof moduleApi.registerHooks === 'function';

const registerPath = fileURLToPath(
  new URL('../../../esm/register.mjs', import.meta.url)
);

const debugFixtures = process.env.HMR_DEBUG_FIXTURES === '1';

/**
 * @param {string} fixturePath absolute path to entry module
 * @param {(message: any) => void} onMessage
 * @param {{ onError?: (err: Error) => void, onExit?: (code: number | null, signal: NodeJS.Signals | null) => void }} [opts]
 * @returns {import('node:child_process').ChildProcess}
 */
export function forkEsmFixture(fixturePath, onMessage, opts = {}) {
  const child = spawn(
    process.execPath,
    ['--enable-source-maps', '--import', registerPath, fixturePath],
    {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      cwd: path.dirname(fixturePath),
      env: { ...process.env, NODE_NO_WARNINGS: '1' }
    }
  );

  let stderr = '';

  child.on('message', onMessage);
  child.on('error', err => {
    opts.onError?.(err);
  });
  child.on('exit', (code, signal) => {
    opts.onExit?.(code, signal);
  });
  child.stderr.on('data', chunk => {
    stderr += chunk;
    if (debugFixtures) {
      process.stderr.write(`[esm fixture ${fixturePath}] ${chunk}`);
    }
  });
  child.stdout.on('data', chunk => {
    if (debugFixtures) {
      process.stdout.write(`[esm fixture ${fixturePath}] ${chunk}`);
    }
  });

  child.getStderr = () => stderr;

  return child;
}

/**
 * @param {[number, number]} a
 * @param {[number, number]} b
 */
export function hrtimeIncreased(a, b) {
  return (b[0] - a[0]) * 1e9 + (b[1] - a[1]) > 0;
}
