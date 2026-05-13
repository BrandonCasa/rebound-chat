import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

import packageJson from "../../frontend/package.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const buildDir = path.join(__dirname, "..", "..", "frontend", "build");
const sharedDir = path.join(__dirname, "..", "..", "..", "shared");
const electronDir = path.join(__dirname, "..");
const appDir = path.join(__dirname, "..", "..", "frontend", "app");

try {
	// 1) ensure/clear appDir
	if (!fs.existsSync(appDir)) {
		fs.mkdirSync(appDir);
	} else {
		for (const f of fs.readdirSync(appDir)) {
			fs.rmSync(path.join(appDir, f), { recursive: true, force: true });
		}
	}

	// 2) copy build → app/build
	if (fs.existsSync(buildDir)) {
		fs.cpSync(buildDir, path.join(appDir, "build"), { recursive: true });
	}

	// 2b) copy shared → app/shared (Electron main process files in app/build
	// import from ../../../shared/... at runtime; without this copy the
	// packaged ASAR is missing the shared protocol/types modules and the
	// main process crashes on launch with ERR_MODULE_NOT_FOUND).
	if (fs.existsSync(sharedDir)) {
		fs.cpSync(sharedDir, path.join(appDir, "shared"), { recursive: true });
	}

	// 2c) copy electron runtime tree → app/electron
	if (fs.existsSync(path.join(electronDir, "main"))) {
		fs.cpSync(path.join(electronDir, "main"), path.join(appDir, "electron", "main"), { recursive: true });
	}
	if (fs.existsSync(path.join(electronDir, "preload"))) {
		fs.cpSync(path.join(electronDir, "preload"), path.join(appDir, "electron", "preload"), { recursive: true });
	}
	if (fs.existsSync(path.join(electronDir, "streaming"))) {
		fs.cpSync(path.join(electronDir, "streaming"), path.join(appDir, "electron", "streaming"), { recursive: true });
	}
	if (fs.existsSync(path.join(electronDir, "sources"))) {
		fs.cpSync(path.join(electronDir, "sources"), path.join(appDir, "electron", "sources"), { recursive: true });
	}

	// 3) write new package.json
	const { version, author, dependencies } = packageJson;
	const newPkg = {
		name: "rebound-desktop",
		version,
		private: false,
		main: "electron/main/electron.js",
		description: "Rebound Nexus official desktop client.",
		author,
		dependencies,
	};
	fs.writeFileSync(path.join(appDir, "package.json"), JSON.stringify(newPkg, null, 2));

	const lockfile = path.join(__dirname, "..", "..", "..", "pnpm-lock.yaml");
	const workspace = path.join(__dirname, "..", "..", "..", "pnpm-workspace.yaml");
	if (fs.existsSync(lockfile)) fs.copyFileSync(lockfile, path.join(appDir, "pnpm-lock.yaml"));
	if (fs.existsSync(workspace)) fs.copyFileSync(workspace, path.join(appDir, "pnpm-workspace.yaml"));

	console.log("Clean build completed successfully.");
} catch (err) {
	console.error("Error during clean build:", err);
	process.exit(1);
}
