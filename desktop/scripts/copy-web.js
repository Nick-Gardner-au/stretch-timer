// Copies the web app (the repository root, minus the desktop folder and tests) into desktop/web so it
// can be bundled into the desktop app. Run automatically by `npm start` and the build scripts.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const DEST = path.resolve(__dirname, "..", "web");
const INCLUDE = ["index.html", "timer.html", "styles.css", "manifest.webmanifest", "sw.js", "js", "fonts", "icons", "pilates", "mobility"];
const SKIP = new Set(["tests.html"]);

function copy(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) if (!SKIP.has(name)) copy(path.join(src, name), path.join(dest, name));
  } else fs.copyFileSync(src, dest);
}

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
for (const item of INCLUDE) copy(path.join(ROOT, item), path.join(DEST, item));
console.log(`Copied web app to ${path.relative(process.cwd(), DEST) || DEST}`);
