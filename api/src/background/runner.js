const createUserScanner = require('../services/userScanner');
const { leaseNextJob, runJob } = require('../services/scanJobs');

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = function startRunner(db) {
  const enabled = (process.env.SCAN_RUNNER_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) {
    console.log('[runner] disabled by SCAN_RUNNER_ENABLED=false');
    return () => {};
  }

  const pollIntervalMs = toPositiveInteger(process.env.SCAN_RUNNER_POLL_MS, 1500);
  const idleIntervalMs = toPositiveInteger(process.env.SCAN_RUNNER_IDLE_MS, 5000);
  const scanner = createUserScanner(db);

  let stopping = false;
  let timer = null;
  let inFlight = false;

  const schedule = (delay) => {
    if (stopping) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(loop, delay);
    if (typeof timer.unref === 'function') timer.unref();
  };

  const loop = async () => {
    if (stopping || inFlight) return;
    inFlight = true;
    try {
      const job = await leaseNextJob(db);
      if (!job) {
        schedule(idleIntervalMs);
        return;
      }
      await runJob(db, job, scanner);
      schedule(pollIntervalMs);
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      console.error('[runner] cycle failed:', message);
      schedule(idleIntervalMs);
    } finally {
      inFlight = false;
    }
  };

  schedule(0);

  return () => {
    stopping = true;
    if (timer) clearTimeout(timer);
  };
};
