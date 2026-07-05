const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const updates = JSON.parse(fs.readFileSync(path.join(root, "updates.json"), "utf8"));
const xpi = fs.readFileSync(path.join(root, "zotero-doi-fix.xpi"));

const addonID = "doi-fix@zotero.org";
const update = updates.addons[addonID].updates[0];
const xpiHash = crypto.createHash("sha256").update(xpi).digest("hex");

assert.strictEqual(manifest.version, "1.1.6");
assert.strictEqual(manifest.applications.zotero.id, addonID);
assert.strictEqual(manifest.applications.zotero.strict_min_version, "7.0");
assert.strictEqual(manifest.applications.zotero.strict_max_version, "10.*");

assert.strictEqual(update.version, manifest.version);
assert.strictEqual(update.applications.zotero.strict_min_version, "7.0");
assert.strictEqual(update.applications.zotero.strict_max_version, "10.*");
assert.ok(update.update_link.includes(`/v${manifest.version}/`));
assert.strictEqual(update.update_hash, `sha256:${xpiHash}`);

console.log("PASS compatibilityMetadata");
