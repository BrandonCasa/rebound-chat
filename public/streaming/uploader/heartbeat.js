export function createHeartbeat({ sendHeartbeat, intervalMs, log }) {
	let running = false;
	let timer = null;

	const tick = async () => {
		if (!running) return;
		try {
			await sendHeartbeat();
		} catch (err) {
			log?.(`Heartbeat failed: ${err.message}`);
		}
	};

	return {
		start() {
			if (running) return;
			running = true;
			void tick();
			timer = setInterval(() => {
				void tick();
			}, intervalMs);
		},
		stop() {
			running = false;
			if (timer) {
				clearInterval(timer);
				timer = null;
			}
		},
	};
}
