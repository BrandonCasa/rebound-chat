import path from "node:path";

import { expect } from "chai";

process.env.NODE_ENV = "test";

const { createLiveConfig } = await import("../src/live/config.js");
const { LocalLiveStorageAdapter, S3LiveStorageAdapter, createLiveStorage } = await import("../src/live/storage.js");

class PutObjectCommand {
	constructor(input) {
		this.input = input;
	}
}

class GetObjectCommand {
	constructor(input) {
		this.input = input;
	}
}

class DeleteObjectCommand {
	constructor(input) {
		this.input = input;
	}
}

class DeleteObjectsCommand {
	constructor(input) {
		this.input = input;
	}
}

class ListObjectsV2Command {
	constructor(input) {
		this.input = input;
	}
}

const fakeS3Sdk = {
	PutObjectCommand,
	GetObjectCommand,
	DeleteObjectCommand,
	DeleteObjectsCommand,
	ListObjectsV2Command,
};

class FakeS3Client {
	constructor() {
		this.calls = [];
		this.objects = new Map();
	}

	async send(command) {
		const commandName = command.constructor.name;
		const input = command.input;
		this.calls.push({ commandName, input });

		if (commandName === "PutObjectCommand") {
			this.objects.set(input.Key, {
				body: Buffer.from(input.Body),
				contentType: input.ContentType || "",
				lastModified: new Date("2026-01-01T00:00:00.000Z"),
			});
			return {};
		}

		if (commandName === "GetObjectCommand") {
			const object = this.objects.get(input.Key);
			if (!object) throw new Error(`Missing object ${input.Key}`);
			return {
				Body: object.body,
				ContentLength: object.body.length,
				LastModified: object.lastModified,
			};
		}

		if (commandName === "DeleteObjectCommand") {
			this.objects.delete(input.Key);
			return {};
		}

		if (commandName === "DeleteObjectsCommand") {
			for (const object of input.Delete.Objects) {
				this.objects.delete(object.Key);
			}
			return {};
		}

		if (commandName === "ListObjectsV2Command") {
			const keys = [...this.objects.keys()].filter((key) => key.startsWith(input.Prefix)).sort();
			return {
				Contents: keys.map((Key) => ({ Key })),
				IsTruncated: false,
			};
		}

		throw new Error(`Unhandled fake S3 command ${commandName}`);
	}
}

const createConfig = (env = {}) =>
	createLiveConfig(
		{
			NODE_ENV: "test",
			...env,
		},
		{ logger: { warn() {} } }
	);

describe("live storage adapters", () => {
	it("resolves AWS dev bucket environment into S3 live storage config", () => {
		const config = createConfig({
			AWS_REGION: "us-east-2",
			LIVE_STORAGE_BACKEND: "s3",
			LIVE_S3_PREFIX: "/dev/live/",
			S3_LIVE_BUCKET: "rebound-dev-live",
			S3_MEDIA_BUCKET: "rebound-dev-media",
		});

		expect(config.storageBackend).to.equal("s3");
		expect(config.s3Bucket).to.equal("rebound-dev-live");
		expect(config.s3LiveBucket).to.equal("rebound-dev-live");
		expect(config.s3MediaBucket).to.equal("rebound-dev-media");
		expect(config.s3Region).to.equal("us-east-2");
		expect(config.s3Prefix).to.equal("dev/live");
		expect(createLiveStorage(config)).to.be.instanceOf(S3LiveStorageAdapter);
	});

	it("keeps legacy LIVE_S3_BUCKET compatibility while preferring S3_LIVE_BUCKET", () => {
		const config = createConfig({
			LIVE_STORAGE_BACKEND: "s3",
			LIVE_S3_BUCKET: "legacy-live-bucket",
			S3_LIVE_BUCKET: "dev-live-bucket",
		});

		expect(config.s3Bucket).to.equal("dev-live-bucket");
		expect(config.s3LiveBucket).to.equal("dev-live-bucket");
	});

	it("reports a clear setup error when S3 storage is selected without a live bucket", async () => {
		const storage = new S3LiveStorageAdapter(createConfig({ LIVE_STORAGE_BACKEND: "s3" }), {
			sdk: fakeS3Sdk,
			client: new FakeS3Client(),
		});

		let error = null;
		try {
			await storage.writeBuffer("sessions/session-123/master.m3u8", Buffer.from("#EXTM3U"));
		} catch (err) {
			error = err;
		}

		expect(error).to.be.instanceOf(Error);
		expect(error.message).to.include("S3_LIVE_BUCKET or LIVE_S3_BUCKET");
	});

	it("writes, reads, deletes, and prefix-cleans S3 live objects under the configured prefix", async () => {
		const client = new FakeS3Client();
		const storage = new S3LiveStorageAdapter(
			createConfig({
				AWS_REGION: "us-east-2",
				LIVE_STORAGE_BACKEND: "s3",
				LIVE_S3_PREFIX: "dev/live",
				S3_LIVE_BUCKET: "rebound-dev-live",
			}),
			{ sdk: fakeS3Sdk, client }
		);

		await storage.writeBuffer("sessions/session-123/master.m3u8", Buffer.from("#EXTM3U"), {
			contentType: "application/vnd.apple.mpegurl",
		});
		await storage.writeBuffer("sessions/session-123/segments/segment-000001.ts", Buffer.from("segment"), {
			contentType: "video/mp2t",
		});

		expect(client.calls[0].input).to.include({
			Bucket: "rebound-dev-live",
			Key: "dev/live/sessions/session-123/master.m3u8",
			ContentType: "application/vnd.apple.mpegurl",
		});

		const storedObject = await storage.readObject("sessions/session-123/master.m3u8");
		expect(storedObject.body.toString("utf8")).to.equal("#EXTM3U");
		expect(storedObject.size).to.equal(Buffer.byteLength("#EXTM3U"));
		expect(storedObject.lastModified.toISOString()).to.equal("2026-01-01T00:00:00.000Z");

		await storage.deleteObject("sessions/session-123/master.m3u8");
		expect(client.objects.has("dev/live/sessions/session-123/master.m3u8")).to.equal(false);

		await storage.deletePrefix("sessions/session-123");
		expect(client.objects.has("dev/live/sessions/session-123/segments/segment-000001.ts")).to.equal(false);
		expect(client.calls.some((call) => call.commandName === "ListObjectsV2Command" && call.input.Prefix === "dev/live/sessions/session-123/")).to.equal(true);
	});

	it("prevents local storage keys from escaping the configured storage root", () => {
		const adapter = new LocalLiveStorageAdapter(path.resolve("test-live-storage"));

		expect(() => adapter.resolvePath("../outside.ts")).to.throw("escaped the live storage root");
	});
});
