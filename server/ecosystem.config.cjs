module.exports = {
	apps: [
		{
			name: "rebound-express",
			script: "./build/app.js",
			watch: ["build", ".env", "package.json", "pnpm-lock.json"],
			watch_delay: 250,
			ignore_watch: ["dev", "node_modules", "uploads"],
			exp_backoff_restart_delay: 100,
			restart_delay: 5000,
			env: {
				NODE_ENV: "production",
			},
		},
	],
};
