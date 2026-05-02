import fs from "node:fs/promises";
import path from "node:path";

import { liveConfig } from "./config.js";

class LocalLiveStorageAdapter {
	constructor(baseDir) {
		this.baseDir = path.resolve(baseDir);
	}

	resolvePath(storageKey) {
		const targetPath = path.resolve(this.baseDir, ...String(storageKey).split("/"));
		if (!targetPath.startsWith(this.baseDir)) {
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
	constructor(config) {
		this.bucket = config.s3Bucket;
		this.endpoint = config.s3Endpoint || undefined;
		this.forcePathStyle = config.s3ForcePathStyle;
		this.region = config.s3Region;
		this.sdk = null;
		this.client = null;
	}

	async loadSdk() {
		if (this.sdk && this.client) {
			return { sdk: this.sdk, client: this.client };
		}

		if (!this.bucket) {
			throw new Error("LIVE_S3_BUCKET is required when LIVE_STORAGE_BACKEND=s3.");
		}

		try {
			const sdk = await import("@aws-sdk/client-s3");
			const client = new sdk.S3Client({
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

	async writeBuffer(storageKey, value) {
		const { sdk, client } = await this.loadSdk();
		await client.send(
			new sdk.PutObjectCommand({
				Bucket: this.bucket,
				Key: storageKey,
				Body: value,
			})
		);
	}

	async readObject(storageKey) {
		const { sdk, client } = await this.loadSdk();
		const response = await client.send(
			new sdk.GetObjectCommand({
				Bucket: this.bucket,
				Key: storageKey,
			})
		);

		const bytes = await response.Body.transformToByteArray();
		return {
			body: Buffer.from(bytes),
			lastModified: response.LastModified || new Date(),
			size: response.ContentLength || bytes.length,
		};
	}

	async deleteObject(storageKey) {
		const { sdk, client } = await this.loadSdk();
		await client.send(
			new sdk.DeleteObjectCommand({
				Bucket: this.bucket,
				Key: storageKey,
			})
		);
	}

	async deleteObjects(storageKeys = []) {
		if (!storageKeys.length) return;

		const { sdk, client } = await this.loadSdk();
		await client.send(
			new sdk.DeleteObjectsCommand({
				Bucket: this.bucket,
				Delete: {
					Objects: storageKeys.map((storageKey) => ({ Key: storageKey })),
					Quiet: true,
				},
			})
		);
	}

	async deletePrefix(storagePrefix) {
		const { sdk, client } = await this.loadSdk();
		let continuationToken = undefined;

		do {
			const listResponse = await client.send(
				new sdk.ListObjectsV2Command({
					Bucket: this.bucket,
					Prefix: storagePrefix,
					ContinuationToken: continuationToken,
				})
			);

			const keys = (listResponse.Contents || []).map((entry) => entry.Key).filter(Boolean);
			if (keys.length) {
				await this.deleteObjects(keys);
			}

			continuationToken = listResponse.IsTruncated ? listResponse.NextContinuationToken : undefined;
		} while (continuationToken);
	}
}

const createLiveStorage = (config = liveConfig) => {
	if (config.storageBackend === "s3") {
		return new S3LiveStorageAdapter(config);
	}

	return new LocalLiveStorageAdapter(config.storageDir);
};

export { createLiveStorage };
