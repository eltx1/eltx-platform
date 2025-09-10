const { createPool } = require("mysql2/promise");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

let pool;

async function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
  pool = createPool(process.env.DATABASE_URL);
  return pool;
}

module.exports = { getPool };
