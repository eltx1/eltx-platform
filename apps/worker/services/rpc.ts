import { logger } from './logger.ts';

export async function rpcCall<T>(fnName: string, call: () => Promise<T>, ctx: Record<string, any> = {}) {
  const max = 3;
  let attempt = 0;
  while (true) {
    attempt++;
    const start = Date.now();
    try {
      const result = await call();
      const took = Date.now() - start;
      return { result, took };
    } catch (e: any) {
      const took = Date.now() - start;
      const errMsg = e?.message || String(e);
      logger.error('RPC', 'ERROR', `fn=${fnName} attempt=${attempt}/${max} took=${took}ms err=${errMsg}`, ctx);
      if (attempt >= max) {
        logger.error('RPC', 'GIVEUP', `fn=${fnName}`, ctx);
        throw e;
      }
      const backoff = 200 * attempt;
      logger.warn('RPC', 'RETRY', `fn=${fnName} attempt=${attempt}/${max} backoff=${backoff}ms`, ctx);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
}
