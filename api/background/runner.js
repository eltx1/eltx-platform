const { leaseNextJob, runJob } = require('../src/services/scanJobs');
const createUserScanner = require('../src/services/userScanner');

module.exports = function startBackgroundRunner(db) {
  const scanner = createUserScanner(db);
  console.log('[runner] started');
  async function loop() {
    try {
      const job = await leaseNextJob(db);
      if (job) {
        console.log(`[runner] leased job=${job.id} user=${job.user_id} range=${job.from_block}-${job.to_block}`);
        await runJob(db, job, scanner);
      }
    } catch (e) {
      console.error('[runner]', e.message);
    }
    setTimeout(loop, 1000);
  }
  loop();
};
