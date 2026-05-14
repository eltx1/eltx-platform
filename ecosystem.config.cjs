module.exports = {
  apps: [
    {
      name: 'next',
      cwd: '/home/dash/public_html/lordai.net',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'api',
      cwd: '/home/dash/public_html/lordai.net',
      script: 'npm',
      args: 'run api:start',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
