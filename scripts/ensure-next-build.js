/* Ensures Next.js build artifacts exist before starting the server. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const manifestPath = path.join(process.cwd(), '.next', 'prerender-manifest.json');

function main() {
  if (fs.existsSync(manifestPath)) {
    console.log('[ensure-next-build] Found existing Next.js build artifacts, skipping rebuild.');
    return;
  }

  console.warn('[ensure-next-build] Missing .next/prerender-manifest.json. Running "npm run build" first.');
  const result = spawnSync('npm', ['run', 'build'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    console.error('[ensure-next-build] Failed to build Next.js app.');
    process.exit(result.status ?? 1);
  }
}

main();
