#!/usr/bin/env node
const [major, minor] = process.versions.node.split('.').map((v) => Number(v));
const minMajor = 18;
const minMinor = 17;
const ok = Number.isFinite(major) && Number.isFinite(minor)
  && (major > minMajor || (major === minMajor && minor >= minMinor));

if (ok) {
  process.exit(0);
}

console.error('[runtime-check] Unsupported Node.js version detected: ' + process.versions.node);
console.error('[runtime-check] This project uses Next.js 14 which requires Node.js >= 18.17.0.');
console.error('[runtime-check] Fix on server:');
console.error('  1) Install Node 20 LTS (recommended)');
console.error('  2) Reinstall deps: npm ci');
console.error('  3) Build/start: npm run build && npm run start');
console.error('[runtime-check] nvm example:');
console.error('  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash');
console.error('  export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"');
console.error('  nvm install 20 && nvm use 20 && nvm alias default 20');
process.exit(1);
