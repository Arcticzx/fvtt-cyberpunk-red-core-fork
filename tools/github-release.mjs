import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, "dist");
const RELEASE_DIR = path.join(ROOT, "release");
const GULP_BIN = path.join(ROOT, "node_modules", "gulp", "bin", "gulp.js");

/**
 * Recursively add all files from `dir` into `zip` using POSIX `/` paths
 * so `system.json` sits at the root of the archive.
 *
 * @param {AdmZip} zip
 * @param {string} dir
 * @param {string} prefix
 */
function addDirectoryToZip(zip, dir, prefix) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const zipPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      addDirectoryToZip(zip, fullPath, zipPath);
    } else if (entry.isFile()) {
      zip.addLocalFile(fullPath, prefix);
    }
  }
}

/**
 * Build the compiled system into `dist/` and package `release/system.json`
 * plus `release/cyberpunk-red-core.zip` pointing to the GitHub Release URLs.
 */
function main() {
  const fallbackManifest = path.join(ROOT, "src", "system.json");
  const rawTag =
    process.argv[2] ||
    process.env.GITHUB_REF_NAME ||
    JSON.parse(fs.readFileSync(fallbackManifest, "utf8")).version;
  const version = rawTag.replace(/^v/, "");
  const tag = rawTag.startsWith("v") ? rawTag : `v${rawTag}`;
  const repoSlug =
    process.env.GITHUB_REPOSITORY || "Arcticzx/fvtt-cyberpunk-red-core-fork";

  const env = { ...process.env };
  delete env.FOUNDRY_DATA_PATH;
  env.CI = "true";
  env.CI_COMMIT_TAG = version;

  execFileSync(process.execPath, [GULP_BIN, "build"], {
    cwd: ROOT,
    env,
    stdio: "inherit",
  });

  const manifestPath = path.join(DIST_DIR, "system.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.version = version;
  manifest.url = `https://github.com/${repoSlug}`;
  manifest.manifest = `https://github.com/${repoSlug}/releases/latest/download/system.json`;
  manifest.download = `https://github.com/${repoSlug}/releases/download/${tag}/cyberpunk-red-core.zip`;

  const serializedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.writeFileSync(manifestPath, serializedManifest, "utf8");

  fs.mkdirSync(RELEASE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(RELEASE_DIR, "system.json"),
    serializedManifest,
    "utf8",
  );

  const zip = new AdmZip();
  addDirectoryToZip(zip, DIST_DIR, "");
  const zipOutPath = path.join(RELEASE_DIR, `${manifest.id}.zip`);
  zip.writeZip(zipOutPath);

  console.log(`Release version: ${manifest.version}`);
  console.log(`Manifest URL:    ${manifest.manifest}`);
  console.log(`Download URL:    ${manifest.download}`);
  console.log(`Package written: ${zipOutPath}`);
}

main();
