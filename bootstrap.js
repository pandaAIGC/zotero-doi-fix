/**
 * DOI Fix - Zotero plugin bootstrap entry point.
 */

var addonData = null;
var doiManager = {};
var FTL_FILE = "doi-fix.ftl";
var MENU_ICON = "icons/icon@48.png";
var ITEM_MENU_ID = "zotero-itemmenu";
var ROOT_MENU_ID = "doi-fix-root-menu";
var DOM_SEPARATOR_ID = "doi-fix-separator";

function install(data, reason) {
  Zotero.debug("DOI Fix: Installing");
}

async function startup({ id, version, rootURI }, reason) {
  addonData = { id, version, rootURI };
  Zotero.debug("DOI Fix: Starting up");

  try {
    Services.scriptloader.loadSubScript(rootURI + "chrome/content/doiManager.js", {
      doiManager,
      Zotero,
      Services,
      URLSearchParams,
    });

    await doiManager.init(addonData);
    registerMenuItems();

    Zotero.debug("DOI Fix: Started successfully");
  } catch (e) {
    Zotero.debug("DOI Fix startup error: " + e);
    Zotero.logError(e);
  }
}

function shutdown(data, reason) {
  Zotero.debug("DOI Fix: Shutting down");

  try {
    unregisterMenuItems();

    if (doiManager.shutdown) {
      doiManager.shutdown();
    }

    addonData = null;
  } catch (e) {
    Zotero.debug("DOI Fix shutdown error: " + e);
    Zotero.logError(e);
  }
}

function uninstall(data, reason) {
  Zotero.debug("DOI Fix: Uninstalling");
}

function onMainWindowLoad({ window }) {
  registerDOMMenuItems(window);
}

function onMainWindowUnload({ window }) {
  unregisterDOMMenuItems(window);
}

function registerMenuItems() {
  for (let win of Zotero.getMainWindows()) {
    registerDOMMenuItems(win);
  }
}

function unregisterMenuItems() {
  for (let win of Zotero.getMainWindows()) {
    unregisterDOMMenuItems(win);
  }
}

async function runMenuCommand(methodName) {
  try {
    await doiManager[methodName]();
  } catch (e) {
    Zotero.debug(`DOI Fix ${methodName} error: ${e}`);
    Zotero.logError(e);
  }
}

function registerDOMMenuItems(win) {
  loadFTL(win);

  let doc = win.document;
  let menu = doc.getElementById(ITEM_MENU_ID);

  if (!menu || doc.getElementById(ROOT_MENU_ID)) {
    return;
  }

  let separator = createMenuElement(doc, "menuseparator");
  separator.id = DOM_SEPARATOR_ID;
  menu.appendChild(separator);

  let rootMenu = createMenuElement(doc, "menu");
  rootMenu.id = ROOT_MENU_ID;
  rootMenu.setAttribute("label", "Zotero DOI Fix");
  rootMenu.setAttribute("data-l10n-id", "doi-fix-menu-root");
  rootMenu.setAttribute("class", "menu-iconic");
  rootMenu.setAttribute("image", addonData.rootURI + MENU_ICON);

  let popup = createMenuElement(doc, "menupopup");
  popup.id = "doi-fix-root-popup";
  popup.appendChild(createDOMMenuItem(doc, "doi-fix-retrieve", "Retrieve DOI", "retrieveDOIForSelectedItems"));
  popup.appendChild(createDOMMenuItem(doc, "doi-fix-update", "Update DOI", "updateDOIForSelectedItems"));
  popup.appendChild(createDOMMenuItem(doc, "doi-fix-validate", "Validate DOI", "validateDOIForSelectedItems"));

  rootMenu.appendChild(popup);
  // Keep native child-node indexes intact and leave this menu outside automatic grouping.
  menu.appendChild(rootMenu);
}

function unregisterDOMMenuItems(win) {
  let doc = win.document;

  for (let id of [
    "doi-fix-separator",
    "doi-fix-root-menu",
    "doi-fix-root-popup",
    "doi-fix-retrieve",
    "doi-fix-update",
    "doi-fix-validate",
  ]) {
    doc.getElementById(id)?.remove();
  }
}

function createDOMMenuItem(doc, id, label, methodName) {
  let menuItem = createMenuElement(doc, "menuitem");
  menuItem.id = id;
  menuItem.setAttribute("label", label);
  menuItem.setAttribute("data-l10n-id", id.replace("doi-fix-", "doi-fix-menu-"));
  menuItem.addEventListener("command", () => runMenuCommand(methodName));
  return menuItem;
}

function createMenuElement(doc, tagName) {
  if (doc.createXULElement) {
    return doc.createXULElement(tagName);
  }

  return doc.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", tagName);
}

function loadFTL(win) {
  try {
    if (win.MozXULElement) {
      win.MozXULElement.insertFTLIfNeeded(FTL_FILE);
    }
  } catch (e) {
    Zotero.logError(e);
  }
}
