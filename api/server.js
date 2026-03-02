require('dotenv').config({ path: '/home/dash/.env' });

const { startServer } = require('./src/app');

startServer();
