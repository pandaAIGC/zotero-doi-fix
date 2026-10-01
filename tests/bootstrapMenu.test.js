const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const bootstrapPath = path.join(__dirname, "..", "bootstrap.js");

class FakeClassList {
  constructor(initial = []) {
    this.classes = new Set(initial);
  }

  add(...classes) {
    for (const className of classes) {
      this.classes.add(className);
    }
  }

  contains(className) {
    return this.classes.has(className);
  }
}

class FakeElement {
  constructor(tagName, options = {}) {
    this.tagName = tagName;
    this.id = options.id || "";
    this.attributes = {};
    this.childNodes = [];
    this.children = this.childNodes;
    this.parentNode = null;
    this.ownerDocument = options.ownerDocument || null;
    this.classList = new FakeClassList(options.classes || []);
    this.hidden = !!options.hidden;
    this.listeners = new Map();

    if (options.l10nID) {
      this.attributes["data-l10n-id"] = options.l10nID;
    }
  }

  setAttribute(name, value) {
    if (name === "id") {
      this.id = value;
    }

    if (name === "class") {
      this.classList = new FakeClassList(String(value).split(/\s+/).filter(Boolean));
    }

    if (name === "hidden") {
      this.hidden = value === true || value === "true";
    }

    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    if (name === "id") {
      return this.id;
    }

    if (name === "hidden") {
      return this.hidden ? "true" : null;
    }

    return this.attributes[name] || null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  removeEventListener(name) {
    this.listeners.delete(name);
  }

  remove() {
    if (this.parentNode) {
      const index = this.parentNode.childNodes.indexOf(this);
      this.parentNode.childNodes.splice(index, 1);
      this.parentNode = null;
    }
  }

  appendChild(child) {
    this.insertBefore(child, null);
  }

  insertBefore(child, reference) {
    if (child.parentNode) {
      const oldIndex = child.parentNode.childNodes.indexOf(child);
      if (oldIndex !== -1) {
        child.parentNode.childNodes.splice(oldIndex, 1);
      }
    }

    child.parentNode = this;
    child.ownerDocument = this.ownerDocument;

    const index = reference ? this.childNodes.indexOf(reference) : -1;
    if (index === -1) {
      this.childNodes.push(child);
    } else {
      this.childNodes.splice(index, 0, child);
    }
  }

  querySelector(selector) {
    return walk(this).find((element) => matchesSelector(element, selector)) || null;
  }
}

class FakeDocument {
  constructor() {
    this.root = null;
  }

  getElementById(id) {
    return walk(this.root).find((element) => element.id === id) || null;
  }

  createXULElement(tagName) {
    return new FakeElement(tagName, { ownerDocument: this });
  }

  createElementNS(_namespace, tagName) {
    return this.createXULElement(tagName);
  }
}

function walk(root) {
  if (!root) {
    return [];
  }

  const elements = [];
  const visit = (element) => {
    elements.push(element);
    for (const child of element.childNodes) {
      visit(child);
    }
  };
  visit(root);
  return elements;
}

function matchesSelector(element, selector) {
  for (const part of selector.split(",").map((value) => value.trim())) {
    if (part.startsWith("#")) {
      if (element.id === part.slice(1)) {
        return true;
      }
      continue;
    }

    if (part === '[data-l10n-id="doi-fix-menu-root"]') {
      if (element.getAttribute("data-l10n-id") === "doi-fix-menu-root") {
        return true;
      }
      continue;
    }

    const classMatch = part.match(/^\.([^:]+)(?::not\(\[hidden='true'\]\))?$/);
    if (classMatch) {
      if (element.classList.contains(classMatch[1]) && !element.hidden) {
        return true;
      }
    }
  }

  return false;
}

function loadBootstrap() {
  const context = {
    URLSearchParams,
    errors: [],
    Zotero: {
      debug() {},
      logError() {},
      getMainWindows() {
        return [];
      },
    },
    Services: {
      scriptloader: {
        loadSubScript(_uri, scope) {
          vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "chrome", "content", "doiManager.js"), "utf8"), scope);
        },
      },
    },
  };
  context.Zotero.logError = (error) => context.errors.push(error);

  vm.createContext(context);
  vm.runInContext(fs.readFileSync(bootstrapPath, "utf8"), context);
  return context;
}

function makeMenu() {
  const doc = new FakeDocument();
  const menu = new FakeElement("menupopup", { id: "zotero-itemmenu", ownerDocument: doc });
  doc.root = menu;

  const showInLibrary = new FakeElement("menuitem", {
    classes: ["zotero-menuitem-show-in-library"],
    ownerDocument: doc,
  });
  const topSeparator = new FakeElement("menuseparator", { ownerDocument: doc });
  const attachNote = new FakeElement("menuitem", {
    classes: ["zotero-menuitem-attach-note"],
    ownerDocument: doc,
  });
  const customSeparator = new FakeElement("menuseparator", {
    classes: ["zotero-custom-menu-item", "zotero-custom-menu-group-separator"],
    ownerDocument: doc,
  });
  const removeItem = new FakeElement("menuitem", { ownerDocument: doc });
  const doiMenu = new FakeElement("menu", {
    id: "doi-fix-item-menu-0",
    classes: ["zotero-custom-menu-item", "doi-fix-item-menu"],
    l10nID: "doi-fix-menu-root",
    ownerDocument: doc,
  });
  doiMenu.setAttribute("label", "Zotero DOI Fix");

  for (const element of [showInLibrary, topSeparator, attachNote, removeItem, customSeparator, doiMenu]) {
    menu.appendChild(element);
  }

  return { menu, attachNote, removeItem, customSeparator, doiMenu };
}

function testDOMFallbackPreservesNativeIndexesAndCleansUp() {
  const context = loadBootstrap();
  const { menu, customSeparator, doiMenu } = makeMenu();
  doiMenu.remove();
  customSeparator.remove();
  const originalNodes = menu.childNodes.slice();
  const win = { document: menu.ownerDocument, setTimeout: (callback) => callback() };
  context.addonData = { id: "doi-fix@zotero.org", rootURI: "resource://doi-fix/" };
  context.Zotero.getMainWindows = () => [win];

  context.registerMenuItems();
  context.onMainWindowLoad({ window: win });
  assert.deepStrictEqual(menu.childNodes.slice(0, 4), originalNodes);
  assert.strictEqual(menu.childNodes.length, 6);
  const root = win.document.getElementById("doi-fix-root-menu");
  assert.strictEqual(root.getAttribute("label"), "Zotero DOI Fix");
  const ids = walk(menu).map((element) => element.id).filter(Boolean);
  assert.strictEqual(new Set(ids).size, ids.length);

  context.onMainWindowUnload({ window: win });
  context.unregisterMenuItems();
  assert.deepStrictEqual(menu.childNodes, originalNodes);
  assert.strictEqual(menu.listeners.size, 0);
}

function testMenuIsVisibleWithoutManagedMenuRendering() {
  const context = loadBootstrap();
  const { menu, customSeparator, doiMenu } = makeMenu();
  doiMenu.remove();
  customSeparator.remove();
  const nativeNodes = menu.childNodes.slice();
  const win = { document: menu.ownerDocument };
  context.addonData = { id: "doi-fix@zotero.org", rootURI: "resource://doi-fix/" };
  context.Zotero.getMainWindows = () => [win];
  context.Zotero.MenuManager = { registerMenu: () => "registered-but-not-rendered" };

  context.registerMenuItems();
  const root = win.document.getElementById("doi-fix-root-menu");
  assert.ok(root, "DOI Fix must have a visible menu even when managed menus have not rendered");
  for (const count of [1, 2, 1]) {
    menu.childNodes[3].removeAttribute("data-l10n-id");
    menu.childNodes[3].setAttribute("label", count === 1 ? "Remove Item from Collection..." : "Remove Items from Collection...");
    assert.deepStrictEqual(menu.childNodes.slice(0, 4), nativeNodes);
    assert.strictEqual(root.getAttribute("label"), "Zotero DOI Fix");
    assert.strictEqual(root.getAttribute("data-l10n-id"), "doi-fix-menu-root");
  }
  context.onMainWindowLoad({ window: win });
  assert.strictEqual(menu.childNodes.length, 6);

  const methods = ["retrieveDOIForSelectedItems", "updateDOIForSelectedItems", "validateDOIForSelectedItems"];
  const commands = [];
  for (const method of methods) context.doiManager[method] = () => commands.push(method);
  for (const item of root.childNodes[0].childNodes) item.listeners.get("command")();
  assert.deepStrictEqual(commands, methods);
  context.onMainWindowUnload({ window: win });
  context.unregisterMenuItems();
  assert.deepStrictEqual(menu.childNodes, nativeNodes);
}

async function testFullStartupAndLateWindowWithLocalizationFailure() {
  for (const lateWindow of [false, true]) {
    const context = loadBootstrap();
    const { menu, customSeparator, doiMenu } = makeMenu();
    doiMenu.remove();
    customSeparator.remove();
    const nativeNodes = menu.childNodes.slice();
    const win = {
      document: menu.ownerDocument,
      MozXULElement: {
        insertFTLIfNeeded() { if (lateWindow) throw new Error("Locale resource unavailable"); },
      },
    };
    context.Zotero.getMainWindows = () => lateWindow ? [] : [win];
    context.Zotero.MenuManager = { registerMenu() { throw new Error("Managed registration must not be used"); } };
    await context.startup({ id: "doi-fix@zotero.org", version: "1.1.8", rootURI: "resource://doi-fix/" });
    if (lateWindow) context.onMainWindowLoad({ window: win });
    assert.strictEqual(typeof context.doiManager.retrieveDOIForSelectedItems, "function");
    assert.strictEqual(win.document.getElementById("doi-fix-root-menu").getAttribute("label"), "Zotero DOI Fix");
    assert.deepStrictEqual(menu.childNodes.slice(0, 4), nativeNodes);
    assert.strictEqual(context.errors.length, lateWindow ? 1 : 0);
    context.onMainWindowUnload({ window: win });
    context.shutdown();
    assert.deepStrictEqual(menu.childNodes, nativeNodes);
  }
}

async function run() {
  for (const test of [testMenuIsVisibleWithoutManagedMenuRendering, testDOMFallbackPreservesNativeIndexesAndCleansUp, testFullStartupAndLateWindowWithLocalizationFailure]) {
    await test();
    console.log(`PASS ${test.name}`);
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
