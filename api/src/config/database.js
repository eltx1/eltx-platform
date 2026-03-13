const mysql = require('mysql2/promise');

function createDatabasePool() {
  const sharedConfig = {
    charset: 'utf8mb4',
  };

  if (process.env.DATABASE_URL) {
    return mysql.createPool({
      uri: process.env.DATABASE_URL,
      ...sharedConfig,
    });
  }

  return mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'eltx',
    ...sharedConfig,
  });
}

module.exports = { createDatabasePool };
