import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import packageJson from "../package.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const buildDir = path.join(__dirname, "..", "build");
const appDir = path.join(__dirname, "..", "app");

try {
	// Ensure the app directory exists or create it.
	if (!fs.existsSync(appDir)) {
		fs.mkdirSync(appDir);
	} else {
		// Clear out the app directory.
		for (const file of fs.readdirSync(appDir)) {
			fs.rmSync(path.join(appDir, file), { recursive: true, force: true });
		}
	}

	// Copy buildDir into appDir.
	if (fs.existsSync(buildDir)) {
		fs.cpSync(buildDir, path.join(appDir, "build"), { recursive: true });
	}

	// Create the new package.json for the desktop client.
	const { version, author, dependencies } = packageJson;
	const newPackageJson = {
		name: "rebound-desktop",
		version,
		private: false,
		main: "build/electron.js",
		description: "Rebound Nexus official desktop client.",
		author,
		dependencies,
	};

	// Write the new package.json with formatting.
	fs.writeFileSync(path.join(appDir, "package.json"), JSON.stringify(newPackageJson, null, 2));
} catch (err) {
	console.error("Error during clean build:", err);
	process.exit(1);
}
console.log("Clean build completed successfully.");
