import fs from "fs";
import net from "net";
import path from "path";

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
		const isDevelopment = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
		const mongoUri = isDevelopment ? await this.startDevelopmentServer() : this.getProductionUri();

		const mongooseOpts = {};
		mongoose.set("strictQuery", false);

		this.setupEventListeners(mongoUri, mongooseOpts);
		await mongoose.connect(mongoUri, mongooseOpts);
	}

	async startDevelopmentServer() {
		const mongoPort = Number(process.env.MONGOMS_PORT || 27017);
		const dbPath = this.resolveDevelopmentDbPath();

		await this.ensurePortAvailable(mongoPort);
		if (this.shouldResetDevelopmentDatabase()) {
			this.resetDevelopmentDirectory(dbPath);
		}

		this.ensureDevDirectory(dbPath);
		this.mongoServer = new MongoMemoryReplSet({
			instanceOpts: [
				{
					port: mongoPort,
					dbPath,
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

	resolveDevelopmentDbPath() {
		return process.env.REBOUND_DEV_DB_PATH || (process.env.NODE_ENV === "test" ? "./dev-test" : "./dev");
	}

	ensureDevDirectory(devPath = "./dev") {
		if (!fs.existsSync(devPath)) {
			fs.mkdirSync(devPath, { recursive: true });
		}
	}

	shouldResetDevelopmentDatabase() {
		const resetValue = process.env.REBOUND_RESET_DEV_DB;

		if (resetValue !== undefined) {
			return ["1", "true", "yes"].includes(resetValue.toLowerCase());
		}

		return process.env.NODE_ENV === "test";
	}

	resetDevelopmentDirectory(devPath) {
		const resolvedPath = path.resolve(devPath);
		const resolvedCwd = path.resolve(process.cwd());

		if (resolvedPath === resolvedCwd || !resolvedPath.startsWith(`${resolvedCwd}${path.sep}`)) {
			throw new Error(`Refusing to reset development database path outside the server workspace: ${resolvedPath}`);
		}

		fs.rmSync(resolvedPath, { recursive: true, force: true });
	}

	async ensurePortAvailable(port) {
		if (!Number.isInteger(port) || port < 1 || port > 65535) {
			throw new Error(`Invalid MongoDB memory server port: ${port}`);
		}

		await new Promise((resolve, reject) => {
			const probe = net.createServer();

			probe.once("error", (err) => {
				if (err.code === "EADDRINUSE") {
					reject(new Error(`MongoDB memory server port ${port} is already in use. Stop that process or set MONGOMS_PORT to a free port.`));
					return;
				}

				reject(err);
			});

			probe.once("listening", () => {
				probe.close(resolve);
			});

			probe.listen(port, "127.0.0.1");
		});
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
