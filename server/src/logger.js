import fs from "node:fs";
import path from "node:path";

import winston from "winston";

const logDir = path.resolve(process.env.REBOUND_LOG_DIR || "./logs");

fs.mkdirSync(logDir, { recursive: true });

const logger = winston.createLogger({
	format: winston.format.json(),
	transports: [
		new winston.transports.File({
			filename: path.join(logDir, "error.log"),
			level: "error",
		}),
		new winston.transports.File({ filename: path.join(logDir, "combined.log") }),
	],
});

let alignColorsAndTime = winston.format.combine(
	winston.format.colorize({
		all: true,
	}),
	winston.format.timestamp({
		format: "(hh:mm:ss A) (MM-DD-YY)",
	}),
	winston.format.printf((info) => `[${info.level}] ${info.timestamp}: ${info.message}`)
);

if (process.env.NODE_ENV !== "production") {
	logger.add(
		new winston.transports.Console({
			format: winston.format.combine(winston.format.colorize(), alignColorsAndTime),
		})
	);
}

logger.stream = {
	write: function (message) {
		logger.info(message.trim());
	},
};

export default logger;
