const fs = require("fs");
const path = require("path");

const buildDir = path.join(__dirname, "..", "build");

fs.readdir(buildDir, (err, files) => {
	if (err) {
		console.error("Error reading build directory:", err);
		process.exit(1);
	}

	files.forEach((file) => {
		if (file !== "electron.js") {
			const filePath = path.join(buildDir, file);
			fs.rmSync(filePath, { recursive: true, force: true });
		}
	});
});
