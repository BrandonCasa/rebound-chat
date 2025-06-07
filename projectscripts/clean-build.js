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

  // 3) patch index.html to use relative "./" URLs
  const indexPath = path.join(appDir, "build", "index.html");
  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, "utf-8");

    // assets folder
    html = html.replace(/(href|src)="\/assets\//g, '$1="./assets/');
    // favicon, icons, manifest
    html = html.replace(/href="\/favicon\.ico"/g, 'href="./favicon.ico"');
    html = html.replace(/href="\/logo192\.png"/g, 'href="./logo192.png"');
    html = html.replace(/href="\/manifest\.json"/g, 'href="./manifest.json"');

    fs.writeFileSync(indexPath, html, "utf-8");
  }

  // 4) write new package.json
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
  fs.writeFileSync(
    path.join(appDir, "package.json"),
    JSON.stringify(newPkg, null, 2),
  );

  // 5) copy lockfiles/workspace if exist
  const lockfile = path.join(__dirname, "..", "pnpm-lock.yaml");
  const workspace = path.join(__dirname, "..", "pnpm-workspace.yaml");
  if (fs.existsSync(lockfile))
    fs.copyFileSync(lockfile, path.join(appDir, "pnpm-lock.yaml"));
  if (fs.existsSync(workspace))
    fs.copyFileSync(workspace, path.join(appDir, "pnpm-workspace.yaml"));

  console.log("Clean build completed successfully.");
} catch (err) {
  console.error("Error during clean build:", err);
  process.exit(1);
}
