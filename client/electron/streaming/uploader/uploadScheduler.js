export function createScheduler({ runPass, intervalMs, log }) {
	let stopping = false;
	let timer = null;

	const tick = async () => {
		if (stopping) return;
		const startedAt = Date.now();
		try {
			await runPass();
		} catch (err) {
			log?.(`Uploader pass error: ${err.message}`);
		}
		if (stopping) return;
		const elapsed = Date.now() - startedAt;
		timer = setTimeout(
			() => {
				void tick();
			},
			Math.max(0, intervalMs - elapsed)
		);
	};

	return {
		start() {
			timer = setTimeout(() => {
				void tick();
			}, 0);
		},
		stop() {
			stopping = true;
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
		},
	};
}
