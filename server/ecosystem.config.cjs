module.exports = {
  apps: [
    {
      autorestart: true,
      name: 'rebound-server',
      script: './src/index.js',
      watch: ['src'],
      // Delay between restart
      watch_delay: 1000,
      ignore_watch: ['node_modules', 'public', 'mongod'],
    },
  ],
};
