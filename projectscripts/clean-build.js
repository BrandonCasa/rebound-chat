import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

import packageJson from "../package.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const buildDir = path.join(__dirname, "..", "build");
const appDir = path.join(__dirname, "..", "app");

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

        // 3) write new package.json
	const { version, author, dependencies } = packageJson;
	const newPkg = {
		name: "rebound-desktop",
		version,
		private: false,
		main: "build/electron.js",
		description: "Rebound Nexus official desktop client.",
		author,
		dependencies,
	};
	fs.writeFileSync(path.join(appDir, "package.json"), JSON.stringify(newPkg, null, 2));

	console.log("Clean build completed successfully.");
} catch (err) {
	console.error("Error during clean build:", err);
	process.exit(1);
}
