#!/usr/bin/env node
/**
 * Stages an LGPL, dynamically-linked FFmpeg + FFprobe for the target platform/arch
 * under <repo>/native/ffmpeg/ so that:
 *   - dev mode resolves binaries directly from the repo
 *   - electron-builder copies them into resources/ffmpeg/ via extraResources
 *
 * Sources:
 *   - win32  (x64, arm64): BtbN/FFmpeg-Builds 'latest' tag, *-lgpl-shared.zip
 *   - linux  (x64, arm64): BtbN/FFmpeg-Builds 'latest' tag, *-lgpl-shared.tar.xz
 *   - darwin (x64, arm64): built from source (https://ffmpeg.org/releases/)
 *                          with --enable-shared --disable-static
 *                          --disable-gpl --disable-nonfree
 *
 * LGPL compliance notes:
 *   - All variants link FFmpeg dynamically (shared libraries) so end users can
 *     replace them with their own LGPL-compatible builds.
 *   - The upstream LICENSE file is copied next to the binaries so it ships
 *     inside the installer.
 *
 * Output layout (single set per host):
 *   native/ffmpeg/
 *     bin/ ffmpeg(.exe), ffprobe(.exe)  [+ *.dll on Windows]
 *     lib/ *.so* | *.dylib              [linux/macOS only]
 *     LICENSE.txt
 *     .version                          [sentinel; matches "describe()"]
 *
 * Behaviour:
 *   - Skips work when the existing .version sentinel matches what we'd produce.
 *   - FFMPEG_FORCE=1 forces a clean re-fetch / rebuild.
 *   - FFMPEG_VERSION=X.Y overrides the macOS source version (default below).
 *   - FFMPEG_ARCH=x64|arm64 overrides process.arch (e.g. CI: Intel mac build on arm64 host).
 */

import { spawn, spawnSync } from "child_process";
import {
	chmodSync,
	copyFileSync,
	createWriteStream,
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	readlinkSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "fs";
import https from "https";
import os from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const NATIVE_DIR = join(ROOT, "native", "ffmpeg");

// macOS source build pin. Bump when a new stable release ships.
const FFMPEG_SOURCE_VERSION = process.env.FFMPEG_VERSION || "8.1";

// BtbN's "latest" tag is a moving pointer to the newest auto-build.
const BTBN_TAG = "latest";

const PLATFORM = process.platform;
// CI: macOS Intel builds run on arm64-hosted runners; match Electron's target
// arch (set FFMPEG_ARCH=x64 | arm64) instead of the host Node arch.
const rawRequestedArch = process.env.FFMPEG_ARCH?.trim();
const ARCH = rawRequestedArch && ["x64", "arm64"].includes(rawRequestedArch) ? rawRequestedArch : process.arch;
const IS_WINDOWS = PLATFORM === "win32";

const log = (msg, ...rest) => console.log(`[ffmpeg] ${msg}`, ...rest);

function binName(name) {
	return IS_WINDOWS ? `${name}.exe` : name;
}

function describe() {
	if (PLATFORM === "darwin") {
		return `darwin-${ARCH}-source-${FFMPEG_SOURCE_VERSION}-lgpl-shared`;
	}
	const slug = btbnSlug();
	return `${PLATFORM}-${ARCH}-btbn-${BTBN_TAG}-${slug}-lgpl-shared`;
}

function btbnSlug() {
	const map = {
		win32: { x64: "win64", arm64: "winarm64" },
		linux: { x64: "linux64", arm64: "linuxarm64" },
	};
	const slug = map[PLATFORM]?.[ARCH];
	if (!slug) {
		throw new Error(`No BtbN lgpl-shared build available for ${PLATFORM}-${ARCH}.`);
	}
	return slug;
}

function validatePlatform() {
	if (PLATFORM === "darwin") {
		if (!["x64", "arm64"].includes(ARCH)) {
			throw new Error(`Unsupported macOS arch: ${ARCH}.`);
		}
		return;
	}
	if (PLATFORM === "win32" || PLATFORM === "linux") {
		btbnSlug();
		return;
	}
	throw new Error(`Unsupported platform: ${PLATFORM}.`);
}

function downloadFile(url, dest, redirects = 0) {
	if (redirects > 5) return Promise.reject(new Error("too many redirects"));
	return new Promise((resolvePromise, rejectPromise) => {
		const file = createWriteStream(dest);
		const req = https.get(url, { headers: { "User-Agent": "rebound-fetch-ffmpeg" } }, (res) => {
			if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
				file.close();
				rmSync(dest, { force: true });
				const next = new URL(res.headers.location, url).toString();
				downloadFile(next, dest, redirects + 1).then(resolvePromise, rejectPromise);
				return;
			}
			if (res.statusCode !== 200) {
				file.close();
				rmSync(dest, { force: true });
				rejectPromise(new Error(`download ${url} -> HTTP ${res.statusCode}`));
				return;
			}
			res.pipe(file);
			file.on("finish", () => file.close((err) => (err ? rejectPromise(err) : resolvePromise())));
		});
		req.on("error", (err) => {
			file.close();
			rmSync(dest, { force: true });
			rejectPromise(err);
		});
	});
}

function runCommand(cmd, args, opts = {}) {
	return new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(cmd, args, { stdio: "inherit", ...opts });
		child.on("error", rejectPromise);
		child.on("exit", (code) => {
			if (code === 0) resolvePromise();
			else rejectPromise(new Error(`${cmd} exited with code ${code}`));
		});
	});
}

function ensureDir(p) {
	mkdirSync(p, { recursive: true });
}

function copyTreePreservingSymlinks(src, dst, fileFilter = () => true) {
	ensureDir(dst);
	for (const entry of readdirSync(src)) {
		const srcPath = join(src, entry);
		const dstPath = join(dst, entry);
		const st = lstatSync(srcPath);
		if (st.isSymbolicLink()) {
			const target = readlinkSync(srcPath);
			try {
				rmSync(dstPath, { force: true });
			} catch {}
			symlinkSync(target, dstPath);
		} else if (st.isDirectory()) {
			copyTreePreservingSymlinks(srcPath, dstPath, fileFilter);
		} else if (st.isFile()) {
			if (!fileFilter(entry)) continue;
			copyFileSync(srcPath, dstPath);
			if (st.mode & 0o111) chmodSync(dstPath, 0o755);
		}
	}
}

async function downloadBtbN() {
	const slug = btbnSlug();
	const ext = IS_WINDOWS ? "zip" : "tar.xz";
	const filename = `ffmpeg-master-${BTBN_TAG}-${slug}-lgpl-shared.${ext}`;
	const url = `https://github.com/BtbN/FFmpeg-Builds/releases/download/${BTBN_TAG}/${filename}`;

	const tmpRoot = join(os.tmpdir(), `rebound-ffmpeg-${Date.now()}`);
	ensureDir(tmpRoot);
	const archivePath = join(tmpRoot, filename);

	try {
		log(`downloading ${url}`);
		await downloadFile(url, archivePath);

		log(`extracting ${filename}`);
		const extractDir = join(tmpRoot, "extract");
		ensureDir(extractDir);
		if (IS_WINDOWS) {
			// PowerShell's Expand-Archive is built-in on Windows 10+.
			await runCommand(
				"powershell.exe",
				["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${extractDir}' -Force`],
				{ shell: false }
			);
		} else {
			await runCommand("tar", ["-xJf", archivePath, "-C", extractDir]);
		}

		const inner = readdirSync(extractDir).filter((n) => !n.startsWith("."));
		if (inner.length !== 1) {
			throw new Error(`unexpected archive layout, found: ${inner.join(", ")}`);
		}
		const innerDir = join(extractDir, inner[0]);
		const srcBin = join(innerDir, "bin");
		const srcLib = join(innerDir, "lib");

		const dstBin = join(NATIVE_DIR, "bin");
		ensureDir(dstBin);

		// Windows: copy ffmpeg.exe, ffprobe.exe, and every DLL into bin/.
		// Linux:   copy just ffmpeg + ffprobe into bin/, real dylibs go to lib/.
		const wantedBin = new Set(IS_WINDOWS ? ["ffmpeg.exe", "ffprobe.exe"] : ["ffmpeg", "ffprobe"]);
		copyTreePreservingSymlinks(srcBin, dstBin, (name) => {
			if (wantedBin.has(name)) return true;
			if (IS_WINDOWS && name.toLowerCase().endsWith(".dll")) return true;
			return false;
		});
		// Sanity check.
		for (const required of wantedBin) {
			if (!existsSync(join(dstBin, required))) {
				throw new Error(`missing ${required} in extracted BtbN archive`);
			}
		}

		if (!IS_WINDOWS && existsSync(srcLib)) {
			const dstLib = join(NATIVE_DIR, "lib");
			ensureDir(dstLib);
			// Keep only runtime shared objects + their symlinks. Skip .a archives,
			// pkg-config metadata, and headers we don't need at runtime.
			copyTreePreservingSymlinks(srcLib, dstLib, (name) => /\.so(\.|$)/.test(name));
		}

		// Bundle the LGPL license text alongside the binaries.
		for (const license of ["LICENSE.txt", "LICENSE", "COPYING.LGPLv2.1"]) {
			const candidate = join(innerDir, license);
			if (existsSync(candidate)) {
				copyFileSync(candidate, join(NATIVE_DIR, "LICENSE.txt"));
				break;
			}
		}
	} finally {
		rmSync(tmpRoot, { recursive: true, force: true });
	}
}

async function buildDarwin() {
	const xcode = spawnSync("xcode-select", ["-p"], { stdio: ["ignore", "pipe", "pipe"] });
	if (xcode.status !== 0) {
		throw new Error("Xcode Command Line Tools required. Run: xcode-select --install");
	}

	let useX86Asm = true;
	if (ARCH === "x64") {
		const nasm = spawnSync("nasm", ["-v"], { stdio: "ignore" });
		if (nasm.status !== 0) {
			log("nasm not found; building with --disable-x86asm (install via 'brew install nasm' for better perf)");
			useX86Asm = false;
		}
	}

	const buildRoot = join(os.tmpdir(), `rebound-ffmpeg-build-${FFMPEG_SOURCE_VERSION}-${ARCH}-${Date.now()}`);
	ensureDir(buildRoot);

	try {
		const sourceUrl = `https://ffmpeg.org/releases/ffmpeg-${FFMPEG_SOURCE_VERSION}.tar.xz`;
		const tarball = join(buildRoot, "ffmpeg.tar.xz");
		log(`downloading source ${sourceUrl}`);
		await downloadFile(sourceUrl, tarball);

		log("extracting source");
		await runCommand("tar", ["-xJf", tarball, "-C", buildRoot]);
		const sourceDir = join(buildRoot, `ffmpeg-${FFMPEG_SOURCE_VERSION}`);
		const prefix = join(buildRoot, "install");

		const archFlag = ARCH === "arm64" ? "arm64" : "x86_64";
		const configFlags = [
			`--prefix=${prefix}`,
			"--enable-shared",
			"--disable-static",
			"--disable-gpl",
			"--disable-nonfree",
			"--disable-doc",
			"--disable-debug",
			"--disable-htmlpages",
			"--disable-manpages",
			"--disable-podpages",
			"--disable-txtpages",
			"--enable-pthreads",
			"--enable-videotoolbox",
			"--enable-audiotoolbox",
			`--arch=${archFlag}`,
			"--cc=clang",
			`--extra-cflags=-arch ${archFlag}`,
			// rpath entries let both the binaries (in bin/) and the dylibs (in
			// lib/) locate sibling LGPL shared libs without DYLD_LIBRARY_PATH.
			`--extra-ldflags=-arch ${archFlag} -Wl,-rpath,@loader_path/../lib -Wl,-rpath,@loader_path`,
			"--install-name-dir=@rpath",
		];
		if (!useX86Asm) configFlags.push("--disable-x86asm");

		log("configuring");
		await runCommand("./configure", configFlags, { cwd: sourceDir });

		const jobs = Math.max(1, os.cpus().length);
		log(`building (-j${jobs})`);
		await runCommand("make", [`-j${jobs}`], { cwd: sourceDir });

		log("installing");
		await runCommand("make", ["install"], { cwd: sourceDir });

		const dstBin = join(NATIVE_DIR, "bin");
		const dstLib = join(NATIVE_DIR, "lib");
		ensureDir(dstBin);
		ensureDir(dstLib);

		for (const name of ["ffmpeg", "ffprobe"]) {
			const src = join(prefix, "bin", name);
			const dst = join(dstBin, name);
			copyFileSync(src, dst);
			chmodSync(dst, 0o755);
		}

		copyTreePreservingSymlinks(join(prefix, "lib"), dstLib, (name) => name.endsWith(".dylib") || /\.\d+\.dylib$/.test(name));

		const lic = join(sourceDir, "COPYING.LGPLv2.1");
		if (existsSync(lic)) copyFileSync(lic, join(NATIVE_DIR, "LICENSE.txt"));
	} finally {
		rmSync(buildRoot, { recursive: true, force: true });
	}
}

async function main() {
	validatePlatform();

	const desiredId = describe();
	const sentinel = join(NATIVE_DIR, ".version");
	const ffmpegOk = existsSync(join(NATIVE_DIR, "bin", binName("ffmpeg")));
	const ffprobeOk = existsSync(join(NATIVE_DIR, "bin", binName("ffprobe")));
	const sentinelOk = existsSync(sentinel) && readFileSync(sentinel, "utf8").trim() === desiredId;

	if (process.env.FFMPEG_FORCE !== "1" && sentinelOk && ffmpegOk && ffprobeOk) {
		log(`already prepared: ${desiredId}`);
		return;
	}

	if (existsSync(NATIVE_DIR)) rmSync(NATIVE_DIR, { recursive: true, force: true });
	ensureDir(NATIVE_DIR);

	if (PLATFORM === "darwin") {
		await buildDarwin();
	} else {
		await downloadBtbN();
	}

	writeFileSync(sentinel, `${desiredId}\n`, "utf8");
	log(`done: ${desiredId}`);
}

main().catch((err) => {
	console.error(`[ffmpeg] failed: ${err?.stack || err?.message || err}`);
	process.exit(1);
});
