import fs from "node:fs/promises";
import path from "node:path";

import { liveConfig } from "./config.js";

const MAX_S3_DELETE_OBJECTS = 1000;

const normalizeS3Prefix = (value = "") =>
	String(value || "")
		.trim()
		.replace(/^\/+|\/+$/g, "");

const normalizeS3StorageKey = (value) => {
	const key = String(value || "").replace(/^\/+/g, "");

	if (!key || key.includes("\0")) {
		throw new Error("Invalid live storage key.");
	}

	return key;
};

const bufferFromS3Body = async (body) => {
	if (Buffer.isBuffer(body)) return body;
	if (body instanceof Uint8Array) return Buffer.from(body);
	if (typeof body === "string") return Buffer.from(body);

	if (typeof body?.transformToByteArray === "function") {
		return Buffer.from(await body.transformToByteArray());
	}

	if (body?.[Symbol.asyncIterator]) {
		const chunks = [];
		for await (const chunk of body) {
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		}
		return Buffer.concat(chunks);
	}

	throw new Error("Unsupported S3 object body type.");
};

const chunkArray = (values, size) => {
	const chunks = [];
	for (let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size));
	}
	return chunks;
};

class LocalLiveStorageAdapter {
	constructor(baseDir) {
		this.baseDir = path.resolve(baseDir);
	}

	resolvePath(storageKey) {
		const targetPath = path.resolve(this.baseDir, ...String(storageKey).split("/"));
		const relativePath = path.relative(this.baseDir, targetPath);
		if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
			throw new Error("Resolved live storage path escaped the live storage root.");
		}
		return targetPath;
	}

	async writeBuffer(storageKey, value) {
		const targetPath = this.resolvePath(storageKey);
		await fs.mkdir(path.dirname(targetPath), { recursive: true });
		await fs.writeFile(targetPath, value);
	}

	async readObject(storageKey) {
		const targetPath = this.resolvePath(storageKey);
		const [body, stats] = await Promise.all([fs.readFile(targetPath), fs.stat(targetPath)]);
		return {
			body,
			lastModified: stats.mtime,
			size: stats.size,
		};
	}

	async deleteObject(storageKey) {
		const targetPath = this.resolvePath(storageKey);
		await fs.rm(targetPath, { force: true });
	}

	async deleteObjects(storageKeys = []) {
		await Promise.all(storageKeys.map((storageKey) => this.deleteObject(storageKey)));
	}

	async deletePrefix(storagePrefix) {
		const targetPath = this.resolvePath(storagePrefix);
		await fs.rm(targetPath, { recursive: true, force: true });
	}
}

class S3LiveStorageAdapter {
	constructor(config, options = {}) {
		this.bucket = config.s3Bucket || config.s3LiveBucket || "";
		this.keyPrefix = normalizeS3Prefix(config.s3Prefix);
		this.endpoint = config.s3Endpoint || undefined;
		this.forcePathStyle = config.s3ForcePathStyle;
		this.region = config.s3Region;
		this.sdk = options.sdk || null;
		this.client = options.client || null;
		this.createClient = options.createClient || null;
	}

	assertConfigured() {
		if (!this.bucket) {
			throw new Error("S3_LIVE_BUCKET or LIVE_S3_BUCKET is required when LIVE_STORAGE_BACKEND=s3.");
		}
	}

	buildObjectKey(storageKey) {
		const key = normalizeS3StorageKey(storageKey);
		return this.keyPrefix ? `${this.keyPrefix}/${key}` : key;
	}

	async loadSdk() {
		this.assertConfigured();

		if (this.sdk && this.client) {
			return { sdk: this.sdk, client: this.client };
		}

		try {
			const sdk = await import("@aws-sdk/client-s3");
			const client =
				this.createClient?.({ sdk, adapter: this }) ||
				new sdk.S3Client({
					region: this.region,
					endpoint: this.endpoint,
					forcePathStyle: this.forcePathStyle,
				});

			this.sdk = sdk;
			this.client = client;

			return { sdk, client };
		} catch (err) {
			if (err?.code === "ERR_MODULE_NOT_FOUND") {
				throw new Error("S3 live storage requires @aws-sdk/client-s3 to be installed in server/package.json.");
			}
			throw err;
		}
	}

	async writeBuffer(storageKey, value, options = {}) {
		const { sdk, client } = await this.loadSdk();
		const input = {
			Bucket: this.bucket,
			Key: this.buildObjectKey(storageKey),
			Body: value,
		};

		if (options.contentType) {
			input.ContentType = options.contentType;
		}

		await client.send(new sdk.PutObjectCommand(input));
	}

	async readObject(storageKey) {
		const { sdk, client } = await this.loadSdk();
		const response = await client.send(
			new sdk.GetObjectCommand({
				Bucket: this.bucket,
				Key: this.buildObjectKey(storageKey),
			})
		);

		const bytes = await bufferFromS3Body(response.Body);
		return {
			body: bytes,
			lastModified: response.LastModified || new Date(),
			size: response.ContentLength ?? bytes.length,
		};
	}

	async deleteObject(storageKey) {
		const { sdk, client } = await this.loadSdk();
		await client.send(
			new sdk.DeleteObjectCommand({
				Bucket: this.bucket,
				Key: this.buildObjectKey(storageKey),
			})
		);
	}

	async deleteObjects(storageKeys = []) {
		if (!storageKeys.length) return;

		const objectKeys = storageKeys.map((storageKey) => this.buildObjectKey(storageKey));
		await this.deleteObjectKeys(objectKeys);
	}

	async deleteObjectKeys(objectKeys = []) {
		if (!objectKeys.length) return;

		const { sdk, client } = await this.loadSdk();
		for (const objectKeyBatch of chunkArray(objectKeys, MAX_S3_DELETE_OBJECTS)) {
			await client.send(
				new sdk.DeleteObjectsCommand({
					Bucket: this.bucket,
					Delete: {
						Objects: objectKeyBatch.map((objectKey) => ({ Key: objectKey })),
						Quiet: true,
					},
				})
			);
		}
	}

	async deletePrefix(storagePrefix) {
		const { sdk, client } = await this.loadSdk();
		const objectPrefix = `${this.buildObjectKey(storagePrefix).replace(/\/+$/g, "")}/`;
		let continuationToken = undefined;

		do {
			const listResponse = await client.send(
				new sdk.ListObjectsV2Command({
					Bucket: this.bucket,
					Prefix: objectPrefix,
					ContinuationToken: continuationToken,
				})
			);

			const keys = (listResponse.Contents || []).map((entry) => entry.Key).filter(Boolean);
			if (keys.length) {
				await this.deleteObjectKeys(keys);
			}

			continuationToken = listResponse.IsTruncated ? listResponse.NextContinuationToken : undefined;
		} while (continuationToken);
	}
}

const createLiveStorage = (config = liveConfig, options = {}) => {
	if (config.storageBackend === "s3") {
		return new S3LiveStorageAdapter(config, options);
	}

	return new LocalLiveStorageAdapter(config.storageDir);
};

export { LocalLiveStorageAdapter, S3LiveStorageAdapter, createLiveStorage };
