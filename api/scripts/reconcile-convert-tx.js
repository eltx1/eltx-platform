#!/usr/bin/env node
const mysql = require('mysql2/promise');
const { ethers } = require('ethers');

async function main() {
  const args = process.argv.slice(2);
  const id = Number(args[args.indexOf('--execution-id') + 1]);
  const txHash = String(args[args.indexOf('--tx-hash') + 1] || '');
  if (!id || !txHash) throw new Error('Usage: --execution-id <id> --tx-hash <hash>');
  const db = await mysql.createConnection(process.env.DATABASE_URL);
  const provider = new ethers.JsonRpcProvider(process.env.CONVERT_BSC_RPC_URL || process.env.BSC_RPC_URL);
  const [rows] = await db.query('SELECT * FROM convert_executions WHERE id=?', [id]);
  if (!rows.length) throw new Error('Execution not found');
  const ex = rows[0];
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt || receipt.status !== 1n) throw new Error('On-chain tx not confirmed successful');
  await db.query('UPDATE convert_executions SET tx_hash=?, status=IF(status IN (\'confirmed\',\'completed\'), status, \'onchain_confirmed\'), metadata=JSON_SET(COALESCE(metadata, JSON_OBJECT()),\'$.reconcile\', JSON_OBJECT(\'at\', NOW(), \'txHash\', ?, \'note\', \'manual_reconcile\')) WHERE id=?', [txHash, txHash, id]);
  console.log(JSON.stringify({ ok: true, execution_id: id, tx_hash: txHash, chain_status: 'confirmed' }));
  await db.end();
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
