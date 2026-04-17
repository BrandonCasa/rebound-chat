import logger from "../logger.js";
import { liveConfig } from "./config.js";
import { LiveService } from "./service.js";

class LiveRuntime {
	constructor(config = liveConfig) {
		this.config = config;
		this.service = new LiveService(config);
		this.cleanupTimer = null;
	}

	start() {
		if (this.cleanupTimer) return;

		this.cleanupTimer = setInterval(() => {
			this.service.runCleanup().catch((err) => {
				logger.error(`Live cleanup error: ${err.message}`);
			});
		}, this.config.cleanupIntervalMs);

		if (typeof this.cleanupTimer.unref === "function") {
			this.cleanupTimer.unref();
		}
	}

	stop() {
		if (!this.cleanupTimer) return;
		clearInterval(this.cleanupTimer);
		this.cleanupTimer = null;
	}
}

const liveRuntime = new LiveRuntime();

export default liveRuntime;
