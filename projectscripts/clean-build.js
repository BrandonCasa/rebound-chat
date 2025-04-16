const fs = require("fs");
const path = require("path");
const packageJson = require("../package.json");

const buildDir = path.join(__dirname, "..", "build");
const appDir = path.join(__dirname, "..", "app");

try {
	// Read the build directory synchronously.
	const files = fs.readdirSync(buildDir);

	// Ensure the app directory exists or create it.
	if (!fs.existsSync(appDir)) {
		fs.mkdirSync(appDir);
	} else {
		// Clear out the app directory.
		const filesApp = fs.readdirSync(appDir);
		filesApp.forEach((fileApp) => {
			fs.rmSync(path.join(appDir, fileApp), { recursive: true, force: true });
		});
	}

	// Copy files from buildDir to appDir.
	files.forEach((file) => {
		fs.cpSync(path.join(buildDir, file), path.join(appDir, file), { recursive: true });
	});

	// Create the new package.json for the desktop client.
	const oldPackageJson = packageJson;
	const newPackageJson = {
		name: "rebound-desktop",
		version: oldPackageJson.version,
		private: false,
		main: "electron.js",
		description: "Rebound Nexus official desktop client.",
		author: oldPackageJson.author,
		dependencies: oldPackageJson.dependencies,
	};

	// Write the new package.json with formatting.
	fs.writeFileSync(path.join(appDir, "package.json"), JSON.stringify(newPackageJson, null, 2));
} catch (err) {
	console.error("Error during clean build:", err);
	process.exit(1);
}
