import fs from 'fs';

const levelMap = { silent:0, error:1, warn:2, info:3, debug:4 } as const;
export type LogLevel = keyof typeof levelMap;
const envLevel = (process.env.WORKER_LOG_LEVEL || 'info').toLowerCase() as LogLevel;
const currentLevel = levelMap[envLevel] ?? levelMap.info;
const jsonMode = String(process.env.WORKER_LOG_JSON || 'false').toLowerCase() === 'true';

function emit(level: LogLevel, tag: string, sub: string, message: string, meta: Record<string, any> = {}) {
  if (levelMap[level] > currentLevel) return;
  if (jsonMode) {
    const entry = { ts: new Date().toISOString(), level, tag, subtag: sub, msg: message, ...meta };
    console.log(JSON.stringify(entry));
    return;
  }
  const line = sub ? `[${tag}][${sub}] ${message}` : `[${tag}] ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  error: (tag: string, sub: string, msg: string, meta?: Record<string, any>) => emit('error', tag, sub, msg, meta),
  warn: (tag: string, sub: string, msg: string, meta?: Record<string, any>) => emit('warn', tag, sub, msg, meta),
  info: (tag: string, sub: string, msg: string, meta?: Record<string, any>) => emit('info', tag, sub, msg, meta),
  debug: (tag: string, sub: string, msg: string, meta?: Record<string, any>) => emit('debug', tag, sub, msg, meta),
  level: envLevel,
  isDebug: () => currentLevel >= levelMap.debug,
};

export function shortAddr(addr: string) {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

export function envPaths(paths: string[]): { loaded: string[]; missing: string[] } {
  const loaded: string[] = [];
  const missing: string[] = [];
  for (const p of paths) {
    if (fs.existsSync(p)) loaded.push(p); else missing.push(p);
  }
  return { loaded, missing };
}

export const SAMPLE_RATE = Number(process.env.WORKER_LOG_SAMPLE_RATE || 0.1);
export const HEARTBEAT_MS = Number(process.env.WORKER_LOG_HEARTBEAT_MS || 30000);
