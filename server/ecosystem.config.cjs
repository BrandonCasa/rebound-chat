module.exports = {
  apps: [
    {
      name: 'rebound-server',
      script: './src/index.js',
      watch: ['src'],
      // Delay between restart
      watch_delay: 1000,
      ignore_watch: ['public', 'mongod'],
      exp_backoff_restart_delay: 100,
      restart_delay: 5000,
    },
  ],
};
