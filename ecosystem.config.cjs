const path = require('path');

const appRoot = __dirname;

module.exports = {
  apps: [
    {
      name: 'next',
      cwd: appRoot,
      script: path.join(appRoot, 'node_modules/next/dist/bin/next'),
      args: 'start -p 3000',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'api',
      cwd: appRoot,
      script: path.join(appRoot, 'api/server.js'),
      interpreter: 'node',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
