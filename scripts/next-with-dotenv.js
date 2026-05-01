#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('[next-with-dotenv] Usage: node scripts/next-with-dotenv.js <next-args...>');
  process.exit(1);
}

const preferred = '/home/dash/.env';
const fallback = path.join(process.cwd(), '.env');
const dotenvPath = process.env.DOTENV_CONFIG_PATH || (fs.existsSync(preferred) ? preferred : fallback);

const child = spawn(
  process.execPath,
  ['-r', 'dotenv/config', 'node_modules/next/dist/bin/next', ...args],
  {
    stdio: 'inherit',
    env: { ...process.env, DOTENV_CONFIG_PATH: dotenvPath },
  }
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
