const mysql = require('mysql2/promise');

function createDatabasePool() {
  return mysql.createPool(
    process.env.DATABASE_URL || {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      database: process.env.DB_NAME || 'eltx',
    }
  );
}

module.exports = { createDatabasePool };
