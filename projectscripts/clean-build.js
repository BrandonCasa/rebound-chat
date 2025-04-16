const fs = require("fs");
const path = require("path");
const packageJson = require("../package.json");

const buildDir = path.join(__dirname, "..", "build");
const appDir = path.join(__dirname, "..", "app");

fs.readdir(buildDir, (err, files) => {
	if (err) {
		console.error("Error reading build directory:", err);
		process.exit(1);
	}

	if (!fs.existsSync(appDir)) {
		fs.mkdirSync(appDir);
	} else {
		// clear out app dir
		fs.readdir(appDir, (err, filesApp) => {
			filesApp.forEach((fileApp) => {
				fs.rmSync(path.join(appDir, fileApp), { recursive: true, force: true });
			});
		});
	}

	files.forEach((file) => {
		fs.cpSync(path.join(buildDir, file), path.join(appDir, file), { recursive: true });
	});

	const oldPackageJson = packageJson;

	let newPackageJson = {
		name: "rebound-desktop",
		version: oldPackageJson.version,
		private: false,
		main: "./electron.js",
		description: "Rebound Nexus official desktop client.",
		author: oldPackageJson.author,
		dependencies: oldPackageJson.dependencies,
	};

	fs.writeFileSync(path.join(appDir, "package.json"), JSON.stringify(newPackageJson));
});
