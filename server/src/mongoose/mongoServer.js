const fs = require("fs");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const logger = require("../logging/logger.js");

let mongoServer;

async function startServer() {
  if (process.env.NODE_ENV === "development") {
    if (!fs.existsSync("./dev")) {
      fs.mkdirSync("./dev");
    }
    mongoServer = new MongoMemoryServer({
      instance: {
        port: 27017,
        dbPath: "dev",
        storageEngine: 'wiredTiger'
      },
    });
  }

  let mongoUri;
  const mongooseOpts = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  };

  if (process.env.NODE_ENV === "development") {
    await mongoServer.start(true);
    mongoUri = await mongoServer.getUri();
    logger.info(mongoUri)
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

  return mongoServer;
}

async function stopServer() {
  await mongoose.connection.close();
  if (process.env.NODE_ENV === "development") {
    await mongoServer.stop();
  }
}

module.exports = { startServer, stopServer };
