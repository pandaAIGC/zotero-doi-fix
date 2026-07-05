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
    Zotero: {
      debug() {},
      logError() {},
      getMainWindows() {
        return [];
      },
    },
    Services: {},
  };

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
  const doiMenu = new FakeElement("menu", {
    classes: ["zotero-custom-menu-item", "doi-fix-item-menu"],
    l10nID: "doi-fix-menu-root",
    ownerDocument: doc,
  });

  for (const element of [showInLibrary, topSeparator, attachNote, customSeparator, doiMenu]) {
    menu.appendChild(element);
  }

  return { menu, attachNote, customSeparator, doiMenu };
}

function testPositionDOIFixMenuMovesMenuBeforeAttachNote() {
  const context = loadBootstrap();
  const { menu, attachNote, customSeparator, doiMenu } = makeMenu();

  context.positionDOIFixMenu(menu);

  const order = menu.childNodes.map((element) => {
    if (element === doiMenu) return "doi";
    if (element === attachNote) return "attach";
    if (element.id === "doi-fix-position-separator") return "doi-separator";
    return element.tagName;
  });

  assert.deepStrictEqual(order.slice(2, 5), ["doi-separator", "doi", "attach"]);
  assert.strictEqual(customSeparator.hidden, true);
}

function run() {
  testPositionDOIFixMenuMovesMenuBeforeAttachNote();
  console.log("PASS testPositionDOIFixMenuMovesMenuBeforeAttachNote");
}

run();
