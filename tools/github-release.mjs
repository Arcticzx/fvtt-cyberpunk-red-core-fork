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
function runGit(args) {
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function formatAuthorHandle(name, email) {
  const noreplyMatch = email.match(
    /^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/i,
  );
  if (noreplyMatch) {
    return `@${noreplyMatch[1]}`;
  }

  const cleanName = name.trim();
  if (cleanName && !/\s/.test(cleanName)) {
    return `@${cleanName}`;
  }
  return cleanName || "unknown";
}

function formatCommitSubject(subject) {
  const clean = subject.trim();
  if (
    /^(feat|fix|docs|ci|chore|refactor|test|build|style|perf)(\([^)]+\))?:/i.test(
      clean,
    )
  ) {
    return clean;
  }
  if (clean.startsWith("Adapt Cyberpunk RED (dev/0.93) for Foundry VTT v14")) {
    return `feat(v14): ${clean.charAt(0).toLowerCase()}${clean.slice(1)}`;
  }
  if (clean.startsWith("Document Foundry v14 fork status")) {
    return `docs(readme): ${clean.charAt(0).toLowerCase()}${clean.slice(1)}`;
  }
  return clean;
}

function resolvePrevRef(targetRef, tag) {
  const parentRef = `${targetRef}^`;
  const previousTag = runGit([
    "describe",
    "--tags",
    "--abbrev=0",
    "--match",
    "v*",
    "--exclude",
    tag,
    parentRef,
  ]);
  if (previousTag) {
    return previousTag;
  }

  const rootCommits = runGit(["rev-list", "--max-parents=0", targetRef]);
  if (!rootCommits) {
    return null;
  }
  const firstRoot = rootCommits.split(/\r?\n/)[0];
  return runGit(["rev-parse", "--short", firstRoot]) || firstRoot;
}

function buildReleaseNotes({ tag, targetRef, repoSlug }) {
  const headSha = runGit(["rev-parse", targetRef]);
  const headShort = runGit(["rev-parse", "--short", targetRef]) || targetRef;
  const tagSha = runGit(["rev-parse", "--verify", `refs/tags/${tag}^{commit}`]);
  const prevRef = resolvePrevRef(targetRef, tag);

  const rangeSpec =
    prevRef && headShort && prevRef !== headShort
      ? `${prevRef}..${targetRef}`
      : targetRef;
  const rawLog =
    runGit([
      "log",
      "--no-merges",
      "--format=%H%x1f%s%x1f%an%x1f%ae",
      rangeSpec,
    ]) || "";

  const bullets = rawLog
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [hash, subject = "", authorName = "", authorEmail = ""] =
        line.split("\x1f");
      const formattedSubject = formatCommitSubject(subject);
      const author = formatAuthorHandle(authorName, authorEmail);
      return `* ${formattedSubject} by ${author} in https://github.com/${repoSlug}/commit/${hash}`;
    });

  const sections = ["## What's Changed"];
  if (bullets.length > 0) {
    sections.push("", ...bullets);
  } else {
    sections.push("", `* Release ${tag}`);
  }

  if (prevRef && prevRef !== headShort) {
    const compareEnd = !tagSha || tagSha === headSha ? tag : headShort;
    sections.push(
      "",
      `**Full Changelog**: https://github.com/${repoSlug}/compare/${prevRef}...${compareEnd}`,
    );
  }

  return `${sections.join("\n")}\n`;
}

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
  const targetRef = process.env.RELEASE_TARGET_REF || "HEAD";

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

  const releaseNotes = buildReleaseNotes({ tag, targetRef, repoSlug });
  const notesOutPath = path.join(RELEASE_DIR, "RELEASE_NOTES.md");
  fs.writeFileSync(notesOutPath, releaseNotes, "utf8");

  const zip = new AdmZip();
  addDirectoryToZip(zip, DIST_DIR, "");
  const zipOutPath = path.join(RELEASE_DIR, `${manifest.id}.zip`);
  zip.writeZip(zipOutPath);

  console.log(`Release version: ${manifest.version}`);
  console.log(`Manifest URL:    ${manifest.manifest}`);
  console.log(`Download URL:    ${manifest.download}`);
  console.log(`Notes written:   ${notesOutPath}`);
  console.log(`Package written: ${zipOutPath}`);
}

main();
