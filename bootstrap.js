/**
 * DOI Fix - Simplified and Fixed Version
 * Bootstrap entry point for the plugin
 */

// Global variables
var doiManager = {};

/**
 * Install handler
 */
function install(data, reason) {
  Zotero.debug("DOI Fix: Installing");
}

/**
 * Startup handler
 */
async function startup({ id, version, rootURI }) {
  Zotero.debug("DOI Fix: Starting up");

  try {
    // Load the core script
    Services.scriptloader.loadSubScript(rootURI + "chrome/content/doiManager.js");

    // Initialize
    await doiManager.init({ id, version, rootURI });

    // Add a small delay to ensure Zotero UI is ready
    await Zotero.Promise.delay(500);

    // Register menu items
    registerMenuItems();

    Zotero.debug("DOI Fix: Started successfully");
  } catch (e) {
    Zotero.debug("DOI Fix startup error: " + e);
    Zotero.logError(e);
  }
}

/**
 * Shutdown handler
 */
function shutdown({ id, version, rootURI }) {
  Zotero.debug("DOI Fix: Shutting down");

  try {
    unregisterMenuItems();

    if (doiManager.shutdown) {
      doiManager.shutdown();
    }
  } catch (e) {
    Zotero.debug("DOI Fix shutdown error: " + e);
  }
}

/**
 * Uninstall handler
 */
function uninstall(data, reason) {
  Zotero.debug("DOI Fix: Uninstalling");
}

/**
 * Register context menu items
 */
function registerMenuItems() {
  try {
    const doc = Zotero.getMainWindow().document;
    const menu = doc.getElementById('zotero-itemmenu');

    if (!menu) {
      Zotero.debug("DOI Fix: Could not find zotero-itemmenu");
      return;
    }

    // Add menu item to retrieve DOI
    const retrieveMenuItem = doc.createXULElement('menuitem');
    retrieveMenuItem.id = 'doi-fix-retrieve';
    retrieveMenuItem.setAttribute('label', 'Retrieve DOI');
    retrieveMenuItem.addEventListener('command', async () => {
      try {
        Zotero.debug("DOI Fix: Retrieve DOI clicked");
        await doiManager.retrieveDOIForSelectedItems();
      } catch (e) {
        Zotero.debug("DOI Fix retrieve error: " + e);
        Zotero.logError(e);
      }
    });
    menu.appendChild(retrieveMenuItem);
    Zotero.debug("DOI Fix: Added Retrieve DOI menu item");

    // Add menu item to update DOI (force update even if exists)
    const updateMenuItem = doc.createXULElement('menuitem');
    updateMenuItem.id = 'doi-fix-update';
    updateMenuItem.setAttribute('label', 'Update DOI');
    updateMenuItem.addEventListener('command', async () => {
      try {
        Zotero.debug("DOI Fix: Update DOI clicked");
        await doiManager.updateDOIForSelectedItems();
      } catch (e) {
        Zotero.debug("DOI Fix update error: " + e);
        Zotero.logError(e);
      }
    });
    menu.appendChild(updateMenuItem);
    Zotero.debug("DOI Fix: Added Update DOI menu item");

    // Add menu item to validate DOI
    const validateMenuItem = doc.createXULElement('menuitem');
    validateMenuItem.id = 'doi-fix-validate';
    validateMenuItem.setAttribute('label', 'Validate DOI');
    validateMenuItem.addEventListener('command', async () => {
      try {
        Zotero.debug("DOI Fix: Validate DOI clicked");
        await doiManager.validateDOIForSelectedItems();
      } catch (e) {
        Zotero.debug("DOI Fix validate error: " + e);
        Zotero.logError(e);
      }
    });
    menu.appendChild(validateMenuItem);
    Zotero.debug("DOI Fix: Added Validate DOI menu item");

  } catch (e) {
    Zotero.debug("DOI Fix registerMenuItems error: " + e);
    Zotero.logError(e);
  }
}

/**
 * Unregister menu items
 */
function unregisterMenuItems() {
  try {
    const menuIds = ['doi-fix-retrieve', 'doi-fix-update', 'doi-fix-validate'];
    const doc = Zotero.getMainWindow().document;
    const menu = doc.getElementById('zotero-itemmenu');

    if (!menu) return;

    menuIds.forEach(id => {
      const item = doc.getElementById(id);
      if (item && menu) {
        menu.removeChild(item);
        Zotero.debug("DOI Fix: Removed menu item " + id);
      }
    });
  } catch (e) {
    Zotero.debug("DOI Fix unregisterMenuItems error: " + e);
  }
}
