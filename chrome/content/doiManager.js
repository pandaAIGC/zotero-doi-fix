/**
 * DOI Fix Core Functionality
 * Compatible with Zotero 7/8/9
 */

if (typeof doiManager === "undefined") {
  var doiManager = {};
}

(function() {

  // Plugin configuration
  let config = {
    id: null,
    version: null,
    rootURI: null,
  };

  /**
   * Initialize the DOI Fix
   */
  doiManager.init = async function({ id, version, rootURI }) {
    config.id = id;
    config.version = version;
    config.rootURI = rootURI;

    Zotero.debug(`DOI Fix ${version} initialized`);
  };

  /**
   * Shutdown handler
   */
  doiManager.shutdown = function() {
    Zotero.debug("DOI Fix: Cleaning up resources");
  };

  /**
   * Retrieve DOI for selected items
   */
  doiManager.retrieveDOIForSelectedItems = async function() {
    const zoteroPane = Zotero.getActiveZoteroPane();
    const items = zoteroPane.getSelectedItems();

    if (!items || items.length === 0) {
      Zotero.alert(null, "DOI Fix", "No items selected");
      return;
    }

    // Filter items that can have DOIs (journal articles, etc.)
    const validItems = this.getRegularItems(items);

    if (validItems.length === 0) {
      Zotero.alert(null, "DOI Fix", "No valid items selected");
      return;
    }

    const progressWindow = new Zotero.ProgressWindow();
    progressWindow.changeHeadline("DOI Fix - Retrieve DOI");
    progressWindow.show();

    let successCount = 0;
    let failCount = 0;

    for (const item of validItems) {
      try {
        const title = item.getField('title') || '(Untitled)';
        progressWindow.addLines(`Processing: ${title.substring(0, 50)}...`);

        const doi = await this.retrieveDOI(item);

        if (doi) {
          item.setField('DOI', doi);
          await item.saveTx();
          successCount++;
          progressWindow.addLines(`Found DOI: ${doi}`);
        } else {
          failCount++;
          progressWindow.addLines("No DOI found");
        }
      } catch (e) {
        failCount++;
        progressWindow.addLines(`Error: ${e.message}`);
        Zotero.debug(`DOI Fix error: ${e}`);
      }
    }

    progressWindow.addLines(`\nCompleted: ${successCount} succeeded, ${failCount} failed`);
    progressWindow.startCloseTimer(4000);
  };

  /**
   * Retrieve DOI for a single item using CrossRef API
   */
  doiManager.retrieveDOI = async function(item, forceUpdate = false) {
    // Check if item already has a DOI (skip if forceUpdate is false)
    if (!forceUpdate) {
      const existingDOI = item.getField('DOI');
      if (existingDOI && existingDOI.trim()) {
        return existingDOI.trim();
      }
    }

    // Get metadata for search
    const title = item.getField('title');
    const creators = item.getCreators();
    const date = item.getField('date', true, true);

    if (!title) {
      throw new Error('Item has no title');
    }

    // Search CrossRef API
    const doi = await this.searchCrossref(title, creators, date);
    return doi;
  };

  /**
   * Update DOI for selected items (force update even if DOI exists)
   */
  doiManager.updateDOIForSelectedItems = async function() {
    const zoteroPane = Zotero.getActiveZoteroPane();
    const items = zoteroPane.getSelectedItems();

    if (!items || items.length === 0) {
      Zotero.alert(null, "DOI Fix", "No items selected");
      return;
    }

    // Filter items that can have DOIs
    const validItems = this.getRegularItems(items);

    if (validItems.length === 0) {
      Zotero.alert(null, "DOI Fix", "No valid items selected");
      return;
    }

    const progressWindow = new Zotero.ProgressWindow();
    progressWindow.changeHeadline("DOI Fix - Update DOI");
    progressWindow.show();

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (const item of validItems) {
      try {
        const title = item.getField('title') || '(Untitled)';
        const oldDOI = item.getField('DOI');

        progressWindow.addLines(`Processing: ${title.substring(0, 50)}...`);

        if (oldDOI) {
          progressWindow.addLines(`  Old DOI: ${oldDOI}`);
        }

        // Force update DOI
        const doi = await this.retrieveDOI(item, true);

        if (doi) {
          if (oldDOI === doi) {
            skippedCount++;
            progressWindow.addLines(`DOI unchanged: ${doi}`);
          } else {
            item.setField('DOI', doi);
            await item.saveTx();
            successCount++;
            progressWindow.addLines(`Updated DOI: ${doi}`);
          }
        } else {
          failCount++;
          progressWindow.addLines("No DOI found");
        }
      } catch (e) {
        failCount++;
        progressWindow.addLines(`Error: ${e.message}`);
        Zotero.debug(`DOI Fix update error: ${e}`);
      }
    }

    progressWindow.addLines(`\nCompleted: ${successCount} updated, ${skippedCount} unchanged, ${failCount} failed`);
    progressWindow.startCloseTimer(5000);
  };

  /**
   * Search CrossRef API for DOI
   */
  doiManager.searchCrossref = async function(title, creators, date) {
    const params = new URLSearchParams({
      "query.title": title,
      rows: "5",
      select: "DOI,title,author,published-print,published-online,issued",
    });

    if (creators && creators.length > 0) {
      const firstAuthor = creators[0];
      if (firstAuthor.lastName) {
        params.set("query.author", firstAuthor.lastName);
      }
    }

    const year = this.extractYear(date);
    if (year) {
      params.set("filter", `from-pub-date:${year},until-pub-date:${year}`);
    }

    const url = `https://api.crossref.org/works?${params.toString()}`;

    try {
      const response = await Zotero.HTTP.request('GET', url, {
        headers: {
          'User-Agent': `Zotero DOI Manager/${config.version}`
        }
      });

      const data = JSON.parse(response.response);

      if (!data.message || !data.message.items || data.message.items.length === 0) {
        return null;
      }

      // Find best match
      const items = data.message.items || [];

      for (const crossrefItem of items) {
        const crossrefTitle = (crossrefItem.title && crossrefItem.title[0]) || '';

        if (this.isSimilarTitle(title, crossrefTitle)) {
          return this.cleanDOI(crossrefItem.DOI);
        }
      }

      return items.length ? this.cleanDOI(items[0].DOI) : null;

    } catch (e) {
      Zotero.debug(`Crossref API error: ${e}`);
      return null;
    }
  };

  /**
   * Check if two titles are similar
   */
  doiManager.isSimilarTitle = function(title1, title2) {
    const normalize = (str) => {
      return (str || '').toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const t1 = normalize(title1);
    const t2 = normalize(title2);

    // Simple similarity check
    if (!t1 || !t2) {
      return false;
    }

    return t1 === t2 || t1.includes(t2) || t2.includes(t1);
  };

  /**
   * Validate DOI for selected items
   */
  doiManager.validateDOIForSelectedItems = async function() {
    const zoteroPane = Zotero.getActiveZoteroPane();
    const items = zoteroPane.getSelectedItems();

    if (!items || items.length === 0) {
      Zotero.alert(null, "DOI Manager", "No items selected");
      return;
    }

    const progressWindow = new Zotero.ProgressWindow();
    progressWindow.changeHeadline("DOI Validation");
    progressWindow.show();

    let validCount = 0;
    let invalidCount = 0;

    for (const item of items) {
      if (!item.isRegularItem()) continue;

      const doi = item.getField('DOI');

      if (!doi || !doi.trim()) {
        const title = item.getField('title') || '(Untitled)';
        progressWindow.addLines(`${title.substring(0, 50)}: No DOI`);
        continue;
      }

      const isValid = await this.validateDOI(doi);

      if (isValid) {
        validCount++;
        progressWindow.addLines(`Valid: ${doi}`);
      } else {
        invalidCount++;
        progressWindow.addLines(`Invalid: ${doi}`);
      }
    }

    progressWindow.addLines(`\nResults: ${validCount} valid, ${invalidCount} invalid`);
    progressWindow.startCloseTimer(4000);
  };

  /**
   * Validate DOI by checking with CrossRef
   */
  doiManager.validateDOI = async function(doi) {
    // Clean up DOI
    doi = doi.trim().replace(/^https?:\/\/doi\.org\//, '');

    try {
      const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;

      const response = await Zotero.HTTP.request('GET', url, {
        headers: {
          'User-Agent': `Zotero DOI Manager/${config.version}`
        },
        successCodes: [200, 404]
      });

      return response.status === 200;

    } catch (e) {
      Zotero.debug(`DOI validation error: ${e}`);
      return false;
    }
  };

  doiManager.getRegularItems = function(items) {
    return (items || []).filter(item => item.isRegularItem() && !item.isFeedItem);
  };

  doiManager.extractYear = function(date) {
    const match = String(date || '').match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/);
    return match ? match[1] : '';
  };

  /**
   * Clean DOI format
   */
  doiManager.cleanDOI = function(doi) {
    if (!doi) return '';

    // Remove URL prefix if present
    doi = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '');

    // Remove whitespace
    doi = doi.trim();

    return doi;
  };

})();
