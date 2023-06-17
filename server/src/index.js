const express = require("express");
const multer = require("multer");
const helmet = require("helmet");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const cors = require("cors");
const fs = require("fs");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/auth.js");
const logger = require("./logging/logger.js");

const dotenv = require("dotenv");
dotenv.config();

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many verification attempts from this IP, please try again after an hour",
});

let mongoServer;
if (process.env.NODE_ENV === "development") {
  if (!fs.existsSync("./dev")) {
    fs.mkdirSync("./dev");
  }
  mongoServer = new MongoMemoryServer({
    instance: {
      port: 27017,
      dbPath: "dev",
    },
  });
}

const app = express();

app.use(cors());

(async function () {
  let mongoUri;
  const mongooseOpts = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  };

  if (process.env.NODE_ENV === "development") {
    await mongoServer.start(true);
    mongoUri = await mongoServer.getUri();
  } else {
    mongoUri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@localhost:27017/${process.env.DB_NAME}?authSource=${process.env.DB_AUTH}`;
  }

  await mongoose.connect(mongoUri, mongooseOpts);

  mongoose.connection.on("error", (e) => {
    if (e.message.code === "ETIMEDOUT") {
      logger.error(e);
      mongoose.connect(mongoUri, mongooseOpts);
    }
    logger.error(e);
  });

  mongoose.connection.once("open", () => {
    logger.info(`MongoDB successfully connected to ${mongoUri}`);
  });
})();

app.use(express.json());

app.use(helmet());

logger.stream = {
  write: function (message) {
    logger.info(message);
  },
};

app.use(morgan("combined", { stream: logger.stream }));

app.get("/api/auth/verify", verifyLimiter, async (req, res) => {
  const valid = jwt.verify(req.headers.authorization, process.env.SECRET);
  res.send(valid);
});

app.use("/api/auth", authRoutes);

app.listen(process.env.PORT, () => logger.info(`Server started on port ${process.env.PORT}`));

process.on("SIGINT", async () => {
  await mongoose.connection.close();
  if (process.env.NODE_ENV === "development") {
    await mongoServer.stop();
  }
  process.exit();
});

mongoose.set("strictQuery", false);
