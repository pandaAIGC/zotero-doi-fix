/**
 * DOI Fix - Zotero plugin bootstrap entry point.
 */

var addonData = null;
var doiManager = {};
var menuRegistrationID = null;
var FTL_FILE = "doi-fix.ftl";
var MENU_ICON = "icons/icon@48.png";
var ITEM_MENU_ID = "zotero-itemmenu";
var ROOT_MENU_ID = "doi-fix-root-menu";
var ROOT_MENU_L10N_ID = "doi-fix-menu-root";
var DOM_SEPARATOR_ID = "doi-fix-separator";
var POSITION_SEPARATOR_ID = "doi-fix-position-separator";

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

  registerItemMenuPositioning(window);
}

function onMainWindowUnload({ window }) {
  unregisterItemMenuPositioning(window);

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
  } else {
    for (let win of Zotero.getMainWindows()) {
      registerDOMMenuItems(win);
    }
  }

  registerItemMenuPositioningForOpenWindows();
}

function unregisterMenuItems() {
  if (menuRegistrationID && Zotero.MenuManager && Zotero.MenuManager.unregisterMenu) {
    Zotero.MenuManager.unregisterMenu(menuRegistrationID);
    menuRegistrationID = null;
  }

  for (let win of Zotero.getMainWindows()) {
    unregisterItemMenuPositioning(win);
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
        icon: addonData.rootURI + MENU_ICON,
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
  rootMenu.setAttribute("class", "menu-iconic");
  rootMenu.setAttribute("image", addonData.rootURI + MENU_ICON);

  let popup = createMenuElement(doc, "menupopup");
  popup.id = "doi-fix-root-popup";
  popup.appendChild(createDOMMenuItem(doc, "doi-fix-retrieve", "Retrieve DOI", "retrieveDOIForSelectedItems"));
  popup.appendChild(createDOMMenuItem(doc, "doi-fix-update", "Update DOI", "updateDOIForSelectedItems"));
  popup.appendChild(createDOMMenuItem(doc, "doi-fix-validate", "Validate DOI", "validateDOIForSelectedItems"));

  rootMenu.appendChild(popup);
  menu.appendChild(rootMenu);
  positionDOIFixMenu(menu);
}

function unregisterDOMMenuItems(win) {
  let doc = win.document;

  for (let id of [
    "doi-fix-separator",
    POSITION_SEPARATOR_ID,
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

function registerItemMenuPositioningForOpenWindows() {
  for (let win of Zotero.getMainWindows()) {
    registerItemMenuPositioning(win);
  }
}

function registerItemMenuPositioning(win) {
  let menu = win.document.getElementById(ITEM_MENU_ID);

  if (!menu || menu._doiFixPositionListener) {
    return;
  }

  let listener = (event) => {
    if (event.target !== menu) {
      return;
    }

    win.setTimeout(() => positionDOIFixMenu(menu), 0);
  };

  menu.addEventListener("popupshowing", listener);
  menu._doiFixPositionListener = listener;
  positionDOIFixMenu(menu);
}

function unregisterItemMenuPositioning(win) {
  let menu = win.document.getElementById(ITEM_MENU_ID);

  if (!menu) {
    return;
  }

  if (menu._doiFixPositionListener) {
    menu.removeEventListener("popupshowing", menu._doiFixPositionListener);
    delete menu._doiFixPositionListener;
  }

  win.document.getElementById(POSITION_SEPARATOR_ID)?.remove();
}

function positionDOIFixMenu(menu) {
  let rootMenu = findDOIFixRootMenu(menu);

  if (!rootMenu) {
    return;
  }

  let anchor = getPreferredItemMenuAnchor(menu);
  let separator = getOrCreateDOIFixSeparator(menu, rootMenu);

  if (anchor && anchor !== separator && anchor !== rootMenu) {
    menu.insertBefore(separator, anchor);
    menu.insertBefore(rootMenu, anchor);
  }

  separator.hidden = rootMenu.hidden;
  hideOrphanedCustomGroupSeparator(menu, rootMenu);
}

function findDOIFixRootMenu(menu) {
  return menu.querySelector(`#${ROOT_MENU_ID}, [data-l10n-id="${ROOT_MENU_L10N_ID}"]`);
}

function getPreferredItemMenuAnchor(menu) {
  return menu.querySelector(".zotero-menuitem-attach-note:not([hidden='true'])")
    || menu.querySelector(".zotero-menuitem-toggle-read-item:not([hidden='true'])")
    || menu.querySelector(".zotero-menuitem-add-to-collection:not([hidden='true'])");
}

function getOrCreateDOIFixSeparator(menu, rootMenu) {
  let doc = menu.ownerDocument;
  let separator = doc.getElementById(DOM_SEPARATOR_ID)
    || doc.getElementById(POSITION_SEPARATOR_ID);

  if (separator) {
    return separator;
  }

  separator = createMenuElement(doc, "menuseparator");
  separator.id = POSITION_SEPARATOR_ID;
  menu.insertBefore(separator, rootMenu);
  return separator;
}

function hideOrphanedCustomGroupSeparator(menu, rootMenu) {
  let customGroupSeparator = menu.querySelector(".zotero-custom-menu-group-separator");

  if (!customGroupSeparator) {
    return;
  }

  let customMenuItems = Array.from(menu.children || menu.childNodes)
    .filter((element) => {
      return element.classList?.contains("zotero-custom-menu-item")
        && element !== rootMenu
        && element.id !== POSITION_SEPARATOR_ID
        && !element.classList.contains("zotero-custom-menu-group-separator");
    });

  customGroupSeparator.hidden = customMenuItems.length === 0;
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
