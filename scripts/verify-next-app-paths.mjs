#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appDir = path.join(root, 'app');
const layoutPath = path.join(appDir, 'layout.tsx');
const globalsPath = path.join(appDir, 'globals.css');

function fail(message) {
  console.error(`[prebuild-check] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(appDir)) fail(`Missing app directory at ${appDir}`);
if (!fs.existsSync(layoutPath)) fail(`Missing app/layout.tsx at ${layoutPath}`);
if (!fs.existsSync(globalsPath)) fail(`Missing app/globals.css at ${globalsPath}`);

const layoutSource = fs.readFileSync(layoutPath, 'utf8');
if (!layoutSource.includes("import './globals.css';")) {
  fail(`app/layout.tsx must contain exact import: import './globals.css';`);
}

const entries = new Set(fs.readdirSync(appDir));
if (!entries.has('globals.css')) {
  fail('Case-sensitivity issue: app/globals.css is not present with exact casing');
}

console.log('[prebuild-check] app/layout.tsx and app/globals.css verified.');
