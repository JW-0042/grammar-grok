const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const version = JSON.parse(read("manifest.json")).version;

test("manifest version is a plain x.y.z version", () => {
  assert.match(version, /^\d+\.\d+\.\d+$/);
});

test("CHANGELOG starts with the manifest version and links it", () => {
  const changelog = read("CHANGELOG.md");
  const firstRelease = changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m)?.[1];
  assert.equal(firstRelease, version);
  assert.match(changelog, new RegExp(`^\\[${version.replace(/\./g, "\\.")}\\]: https://`, "m"));
});

test("docs show the manifest version", () => {
  const files = [
    "README.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "docs/ARCHITECTURE.md",
    "docs/DEVELOPMENT.md",
    "docs/INSTALLATION.md",
    "docs/USAGE.md",
  ];
  for (const file of files) {
    assert.ok(read(file).includes(version), `${file} does not mention ${version}`);
  }
  assert.ok(read("README.md").includes(`badge/version-${version}-`), "README badge is outdated");
});
