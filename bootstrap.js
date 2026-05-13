/**
 * DOI Fix - Zotero plugin bootstrap entry point.
 */

var addonData = null;
var doiManager = {};
var menuRegistrationID = null;
var FTL_FILE = "doi-fix.ftl";

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
    loadFTLIntoOpenWindows();
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
  loadFTL(window);

  if (!hasMenuManager()) {
    registerDOMMenuItems(window);
  }
}

function onMainWindowUnload({ window }) {
  if (!hasMenuManager()) {
    unregisterDOMMenuItems(window);
  }
}

function hasMenuManager() {
  return !!(Zotero.MenuManager && Zotero.MenuManager.registerMenu);
}

function registerMenuItems() {
  if (hasMenuManager()) {
    registerManagedMenu();
    return;
  }

  for (let win of Zotero.getMainWindows()) {
    registerDOMMenuItems(win);
  }
}

function unregisterMenuItems() {
  if (menuRegistrationID && Zotero.MenuManager && Zotero.MenuManager.unregisterMenu) {
    Zotero.MenuManager.unregisterMenu(menuRegistrationID);
    menuRegistrationID = null;
  }

  for (let win of Zotero.getMainWindows()) {
    unregisterDOMMenuItems(win);
  }
}

function registerManagedMenu() {
  if (menuRegistrationID) {
    return;
  }

  menuRegistrationID = Zotero.MenuManager.registerMenu({
    menuID: "doi-fix-item-menu",
    pluginID: addonData.id,
    target: "main/library/item",
    menus: [
      {
        menuType: "submenu",
        l10nID: "doi-fix-menu-root",
        menus: [
          {
            menuType: "menuitem",
            l10nID: "doi-fix-menu-retrieve",
            onCommand: () => runMenuCommand("retrieveDOIForSelectedItems"),
          },
          {
            menuType: "menuitem",
            l10nID: "doi-fix-menu-update",
            onCommand: () => runMenuCommand("updateDOIForSelectedItems"),
          },
          {
            menuType: "menuitem",
            l10nID: "doi-fix-menu-validate",
            onCommand: () => runMenuCommand("validateDOIForSelectedItems"),
          },
        ],
      },
    ],
  });
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
  let menu = doc.getElementById("zotero-itemmenu");

  if (!menu || doc.getElementById("doi-fix-root-menu")) {
    return;
  }

  let separator = createMenuElement(doc, "menuseparator");
  separator.id = "doi-fix-separator";
  menu.appendChild(separator);

  let rootMenu = createMenuElement(doc, "menu");
  rootMenu.id = "doi-fix-root-menu";
  rootMenu.setAttribute("label", "Zotero DOI Fix");

  let popup = createMenuElement(doc, "menupopup");
  popup.id = "doi-fix-root-popup";
  popup.appendChild(createDOMMenuItem(doc, "doi-fix-retrieve", "Retrieve DOI", "retrieveDOIForSelectedItems"));
  popup.appendChild(createDOMMenuItem(doc, "doi-fix-update", "Update DOI", "updateDOIForSelectedItems"));
  popup.appendChild(createDOMMenuItem(doc, "doi-fix-validate", "Validate DOI", "validateDOIForSelectedItems"));

  rootMenu.appendChild(popup);
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
  menuItem.addEventListener("command", () => runMenuCommand(methodName));
  return menuItem;
}

function createMenuElement(doc, tagName) {
  if (doc.createXULElement) {
    return doc.createXULElement(tagName);
  }

  return doc.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", tagName);
}

function loadFTLIntoOpenWindows() {
  for (let win of Zotero.getMainWindows()) {
    loadFTL(win);
  }
}

function loadFTL(win) {
  if (win.MozXULElement) {
    win.MozXULElement.insertFTLIfNeeded(FTL_FILE);
  }
}
