const { leaseNextJob, runJob } = require('../src/services/scanJobs');
const createUserScanner = require('../src/services/userScanner');

module.exports = function startBackgroundRunner(db) {
  const scanner = createUserScanner(db);
  async function loop() {
    try {
      const job = await leaseNextJob(db);
      if (job) {
        await runJob(db, job, scanner);
      }
    } catch (e) {
      console.error('[runner]', e.message);
    }
    setTimeout(loop, 1000);
  }
  loop();
};
