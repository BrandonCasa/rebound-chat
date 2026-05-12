import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { parseMuxers, parseWhipMuxerHelp } from "../capabilities/probe.js";
import { buildArgs as buildPipelineArgs } from "../pipeline.js";
import { buildArgs as buildWhipArgs } from "../output/whip.js";
import { windowsNvencHevcWithAudio, windowsRtxNvenc1080p60 } from "./fixtures/configs.js";

describe("whip output", () => {
	it("builds an FFmpeg WHIP output tail with authorization and handshake timeout", () => {
		assert.deepEqual(
			buildWhipArgs(
				{},
				{
					endpoint: "https://rtc.local/whip",
					authorization: "Bearer publisher-token",
					handshakeTimeoutMs: 7500,
					pktSize: 1200,
					whipFlags: ["dtls_active"],
				}
			),
			[
				"-strict",
				"experimental",
				"-f",
				"whip",
				"-handshake_timeout",
				"7500",
				"-authorization",
				"Bearer publisher-token",
				"-pkt_size",
				"1200",
				"-whip_flags",
				"dtls_active",
				"https://rtc.local/whip",
			]
		);
	});

	it("can be selected by the pipeline without changing the HLS default", () => {
		const config = windowsRtxNvenc1080p60();
		const result = buildPipelineArgs(config, { platform: "win32" }, { output: { type: "whip", options: { endpoint: "https://rtc.local/whip" } } });

		assert.equal(result.args.at(-1), "https://rtc.local/whip");
		assert.ok(result.args.includes("-f"));
		assert.equal(result.args[result.args.indexOf("-f") + 1], "whip");
		assert.doesNotMatch(result.args.join(" "), /master\.m3u8|video\.m3u8/);
	});

	it("keeps opus at 48 kHz when WHIP output carries audio", () => {
		const config = windowsNvencHevcWithAudio();
		config.videoCodec = "h264_nvenc";
		config.audioCodec = "libopus";
		config.audioBitrate = "96k";

		const result = buildPipelineArgs(config, { platform: "win32" }, { output: { type: "whip", options: { endpoint: "https://rtc.local/whip" } } });

		assert.equal(result.args[result.args.indexOf("-c:a") + 1], "libopus");
		assert.equal(result.args[result.args.indexOf("-b:a") + 1], "96k");
		assert.equal(result.args[result.args.indexOf("-ar") + 1], "48000");
	});
});

describe("ffmpeg WHIP capability parsing", () => {
	it("parses whip from ffmpeg -muxers output", () => {
		const muxers = parseMuxers(`
Muxers:
 -- 
 E hls             Apple HTTP Live Streaming
 E whip            WebRTC-HTTP ingestion protocol (WHIP) muxer
`);

		assert.deepEqual(muxers, ["hls", "whip"]);
	});

	it("detects WHIP help output and private authorization option", () => {
		assert.deepEqual(
			parseWhipMuxerHelp(`
Muxer whip [WebRTC-HTTP ingestion protocol (WHIP) muxer]:
    -authorization     <string>     The optional Bearer token for WHIP Authorization
This muxer is experimental.
`),
			{
				available: true,
				authorizationOption: true,
				experimental: true,
			}
		);
	});
});
