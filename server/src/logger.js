import winston from "winston";

const logger = winston.createLogger({
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: "./logs/error.log", level: "error" }), new winston.transports.File({ filename: "./logs/combined.log" })],
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

export default logger;
