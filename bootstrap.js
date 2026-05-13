/**
 * DOI Fix - Zotero plugin bootstrap entry point.
 */

var addonData = null;
var doiManager = {};
var menuRegistrationID = null;

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
        menuType: "menuitem",
        l10nID: "doi-fix-menu-retrieve",
        onShowing: setVisibleForRegularItems,
        onCommand: () => runMenuCommand("retrieveDOIForSelectedItems"),
      },
      {
        menuType: "menuitem",
        l10nID: "doi-fix-menu-update",
        onShowing: setVisibleForRegularItems,
        onCommand: () => runMenuCommand("updateDOIForSelectedItems"),
      },
      {
        menuType: "menuitem",
        l10nID: "doi-fix-menu-validate",
        onShowing: setVisibleForRegularItems,
        onCommand: () => runMenuCommand("validateDOIForSelectedItems"),
      },
    ],
  });
}

function setVisibleForRegularItems(event, context) {
  let items = context.items || [];
  context.setVisible(items.some((item) => item.isRegularItem() && !item.isFeedItem));
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
  let doc = win.document;
  let menu = doc.getElementById("zotero-itemmenu");

  if (!menu || doc.getElementById("doi-fix-retrieve")) {
    return;
  }

  let separator = createMenuElement(doc, "menuseparator");
  separator.id = "doi-fix-separator";
  menu.appendChild(separator);

  menu.appendChild(createDOMMenuItem(doc, "doi-fix-retrieve", "Retrieve DOI", "retrieveDOIForSelectedItems"));
  menu.appendChild(createDOMMenuItem(doc, "doi-fix-update", "Update DOI", "updateDOIForSelectedItems"));
  menu.appendChild(createDOMMenuItem(doc, "doi-fix-validate", "Validate DOI", "validateDOIForSelectedItems"));
}

function unregisterDOMMenuItems(win) {
  let doc = win.document;

  for (let id of ["doi-fix-separator", "doi-fix-retrieve", "doi-fix-update", "doi-fix-validate"]) {
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
