const fs = require("fs");
const path = require("path");

// Subscriber URLs carry credentials, so they live in an untracked file
// (see .gitignore) or a path supplied through XTREAM_MANIFEST.
const manifestPath =
  process.env.XTREAM_MANIFEST || path.join(__dirname, "manifest.local.json");

const CREDENTIAL_PARAMS = ["username", "password"];

function loadManifest(file) {
  if (!fs.existsSync(file)) return [];
  const entries = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(entries)) {
    throw new Error("Manifest must be a JSON array of playlist URLs");
  }
  return entries;
}

function withoutCredentials(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  url.username = "";
  url.password = "";
  for (const key of [...url.searchParams.keys()]) {
    if (CREDENTIAL_PARAMS.includes(key.toLowerCase())) url.searchParams.delete(key);
  }
  return url.toString();
}

const manifest = loadManifest(manifestPath)
  .map(withoutCredentials)
  .filter((entry) => entry !== null);

console.log(manifest);
