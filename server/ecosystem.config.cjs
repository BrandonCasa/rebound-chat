module.exports = {
  apps: [
    {
      name: "rebound-express",
      script: "./src/app.js",
      watch: ["src", ".env", "package.json", "package-lock.json"],
      watch_delay: 250,
      ignore_watch: ["dev", "node_modules", "uploads"],
      exp_backoff_restart_delay: 100,
      restart_delay: 5000,
    },
  ],
};
