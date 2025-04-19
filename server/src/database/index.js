import fs from "fs";

import { MongoMemoryReplSet } from "mongodb-memory-server";
import { GridFSBucket } from "mongodb";
import mongoose from "mongoose";

import logger from "../logger.js";

class DatabaseServer {
	constructor() {
		this.mongoServer = null;
		this.gridfsBucket = null;
	}

	async startServer() {
		const isDevelopment = process.env.NODE_ENV === "development";
		const mongoUri = isDevelopment ? await this.startDevelopmentServer() : this.getProductionUri();

		const mongooseOpts = {
			useNewUrlParser: true,
			useUnifiedTopology: true,
		};
		mongoose.set("strictQuery", false);

		await mongoose.connect(mongoUri, mongooseOpts, () => {});
		this.setupEventListeners(mongoUri, mongooseOpts);
	}

	async startDevelopmentServer() {
		this.ensureDevDirectory();
		this.mongoServer = new MongoMemoryReplSet({
			instanceOpts: [
				{
					port: 27017,
					dbPath: "./dev",
					storageEngine: "wiredTiger",
				},
			],
			replSet: { name: "rs0" },
		});
		await this.mongoServer.start();
		const uri = await this.mongoServer.getUri();
		logger.info(`In-memory MongoDB replica set running at ${uri}`);
		return uri;
	}

	getProductionUri() {
		return `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@localhost:27017/${process.env.DB_NAME}?authSource=${process.env.DB_AUTH}&replicaSet=rs0`;
	}

	setupEventListeners(mongoUri, mongooseOpts) {
		mongoose.connection.on("error", (e) => {
			if (e.message.code === "ETIMEDOUT") {
				logger.error(e);
				mongoose.connect(mongoUri, mongooseOpts);
			}
			logger.error(e);
		});

		mongoose.connection.once("open", () => {
			logger.info(`MongoDB successfully connected to ${mongoUri}`);

			this.gridfsBucket = new GridFSBucket(mongoose.connection.db, {
				bucketName: "uploads",
			});
			logger.info("📁 GridFSBucket initialized for 'uploads' files");
		});
	}

	ensureDevDirectory() {
		const devPath = "./dev";
		if (!fs.existsSync(devPath)) {
			fs.mkdirSync(devPath);
		}
	}

	async stopServer() {
		await mongoose.connection.close();
		if (this.mongoServer) {
			await this.mongoServer.stop();
		}
	}

	getMongoServer() {
		return this.mongoServer;
	}
}

const databaseServer = new DatabaseServer();

export { databaseServer as default };
