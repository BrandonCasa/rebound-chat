module.exports = {
  apps: [
    {
      name: 'rebound-server-dev',
      cwd: 'server',
      script: 'src/app.js',
      watch: ['src', '.env', 'package.json'],
      ignore_watch: ['node_modules', 'tests'],
      env: {
        NODE_ENV: 'development',
      },
    },
    {
      name: 'rebound-frontend-dev',
      script: 'pnpm',
      args: 'start',
      watch: false,
      env: {
        BROWSER: 'none',
      },
    },
  ],
};
