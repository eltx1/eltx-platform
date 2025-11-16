export function ensureEnv(keys: string[]) {
  const missing = keys.filter(k => !process.env[k]);
  if (missing.length) {
    console.warn('[ENV] Missing keys:', missing.join(', '));
  }
}
