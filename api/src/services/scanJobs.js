const crypto = require('crypto');
const { updateLastScannedBlock } = require('./userScanProgress');

async function enqueueUserScan(db, userId, from_block, to_block) {
  const id = crypto.randomUUID();
  await db.query(
    'INSERT INTO user_scan_jobs (id, user_id, from_block, to_block) VALUES (?,?,?,?)',
    [id, userId, from_block, to_block]
  );
  return id;
}

async function leaseNextJob(db) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      'SELECT * FROM user_scan_jobs WHERE status="queued" ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED'
    );
    if (!rows.length) {
      await conn.rollback();
      return null;
    }
    const job = rows[0];
    await conn.query('UPDATE user_scan_jobs SET status="running", started_at=NOW() WHERE id=?', [job.id]);
    await conn.commit();
    return job;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function runJob(db, job, scanner) {
  const BATCH_BLOCKS = 50;
  let current = job.from_block;
  while (current <= job.to_block) {
    const to = Math.min(current + BATCH_BLOCKS - 1, job.to_block);
    await scanner.scanRangeForUser({
      userId: job.user_id,
      fromBlock: current,
      toBlock: to,
      runId: job.id,
    });
    await updateLastScannedBlock(db, job.user_id, to);
    current = to + 1;
  }
  await db.query('UPDATE user_scan_jobs SET status="done", finished_at=NOW() WHERE id=?', [job.id]);
}

async function getJobStatus(db, jobId, userId) {
  const [rows] = await db.query(
    'SELECT id,status,from_block,to_block,started_at,finished_at FROM user_scan_jobs WHERE id=? AND user_id=?',
    [jobId, userId]
  );
  return rows[0] || null;
}

module.exports = { enqueueUserScan, leaseNextJob, runJob, getJobStatus };
