// Move DOI Fix to the front of extensions.json so Zotero starts it first.
// Zotero awaits each plugin's startup() in this file's order, and every update
// moves a plugin to the end, so with many plugins its menu appears late or never.
// Usage (Zotero must be closed): node tools/pin-first.js [profile-dir]
const fs = require("fs");
const os = require("os");
const path = require("path");

const ID = "doi-fix@zotero.org";

function pinFirst(file, id = ID) {
  const db = JSON.parse(fs.readFileSync(file, "utf8"));
  const i = db.addons.findIndex((a) => a.id === id);
  if (i < 0) throw new Error(id + " is not installed in " + file);
  if (i === 0) return false;
  fs.copyFileSync(file, file + ".bak-doifix");
  db.addons.unshift(...db.addons.splice(i, 1));
  fs.writeFileSync(file, JSON.stringify(db));
  return true;
}

function findProfile() {
  const roots = [
    process.env.APPDATA && path.join(process.env.APPDATA, "Zotero", "Zotero", "Profiles"),
    path.join(os.homedir(), "Library", "Application Support", "Zotero", "Profiles"),
    path.join(os.homedir(), ".zotero", "zotero"),
  ].filter(Boolean);
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root)) {
      const dir = path.join(root, name);
      const file = path.join(dir, "extensions.json");
      if (fs.existsSync(file) && fs.readFileSync(file, "utf8").includes(ID)) return dir;
    }
  }
  throw new Error("No Zotero profile with DOI Fix found; pass the profile directory as an argument");
}

function zoteroIsRunning(dir) {
  // Windows keeps parent.lock open while Zotero runs; elsewhere the lock is a symlink or file we cannot test cheaply.
  try {
    fs.closeSync(fs.openSync(path.join(dir, "parent.lock"), "r+"));
    return false;
  } catch (e) {
    return e.code === "EBUSY" || e.code === "EPERM" || e.code === "EACCES";
  }
}

if (require.main === module) {
  const dir = process.argv[2] || findProfile();
  if (zoteroIsRunning(dir)) {
    console.error("Zotero is still running. Close it completely, then run this again.");
    process.exit(1);
  }
  console.log(pinFirst(path.join(dir, "extensions.json")) ? "DOI Fix moved to the front. Start Zotero now." : "DOI Fix is already first.");
}

module.exports = { pinFirst };
