const { createPool } = require("mysql2/promise");
const path = require("path");
const primaryEnv = "/home/dash/.env";
const fallbackEnv = path.join(__dirname, "../../.env");
require("dotenv").config({ path: primaryEnv });
require("dotenv").config({ path: fallbackEnv, override: false });

let pool;

async function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
  pool = createPool(process.env.DATABASE_URL);
  return pool;
}

module.exports = { getPool };
