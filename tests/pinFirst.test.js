const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pinFirst } = require("../tools/pin-first");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doifix-pin-"));
const file = path.join(dir, "extensions.json");
const addons = ["a@x", "b@x", "doi-fix@zotero.org", "c@x"].map((id, n) => ({ id, version: "1." + n, updateDate: 1790895051832 + n }));
fs.writeFileSync(file, JSON.stringify({ schemaVersion: 36, addons }));

assert.strictEqual(pinFirst(file), true);
const moved = JSON.parse(fs.readFileSync(file, "utf8"));
assert.deepStrictEqual(moved.addons.map((a) => a.id), ["doi-fix@zotero.org", "a@x", "b@x", "c@x"]);
assert.strictEqual(moved.schemaVersion, 36);
assert.deepStrictEqual(moved.addons.find((a) => a.id === "doi-fix@zotero.org"), addons[2]);
assert.ok(fs.existsSync(file + ".bak-doifix"));
assert.strictEqual(pinFirst(file), false);
assert.throws(() => pinFirst(file, "missing@x"), /not installed/);

fs.rmSync(dir, { recursive: true });
console.log("PASS pinFirst");
