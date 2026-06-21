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

  const MATCH_THRESHOLD = 0.86;
  const WEAK_MATCH_THRESHOLD = 0.72;
  const TAG_NO_DOI = "doi-fix:no-doi-found";
  const TAG_LOW_CONFIDENCE = "doi-fix:low-confidence";
  const TAG_MULTIPLE_CANDIDATES = "doi-fix:multiple-candidates";
  const TAG_EXISTING_DOI_MISMATCH = "doi-fix:existing-doi-mismatch";
  const OLD_DOI_BACKUP_PREFIX = "DOI Fix previous DOI:";
  const SUPPORTED_ITEM_TYPES = [
    "journalArticle",
    "conferencePaper",
    "book",
    "bookSection",
    "report",
    "thesis",
    "preprint",
    "dataset",
    "document",
    "presentation",
    "standard",
    "encyclopediaArticle",
    "dictionaryEntry",
    "magazineArticle",
    "newspaperArticle",
  ];

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
    let skippedCount = 0;

    for (const item of validItems) {
      try {
        const title = item.getField('title') || '(Untitled)';
        progressWindow.addLines(`Processing: ${title.substring(0, 50)}...`);

        const existingDOI = item.getField('DOI');
        if (existingDOI && existingDOI.trim()) {
          skippedCount++;
          progressWindow.addLines(`Existing DOI, skipped: ${existingDOI.trim()}`);
          continue;
        }

        const result = await this.retrieveDOIResult(item);

        if (result.doi) {
          item.setField('DOI', result.doi);
          this.clearDoiFixTags(item);
          await item.saveTx();
          successCount++;
          progressWindow.addLines(`Found DOI: ${result.doi} (${result.source})`);
        } else {
          failCount++;
          this.tagSearchFailure(item, result.status);
          await item.saveTx();
          progressWindow.addLines(`No DOI written: ${result.message}`);
        }
      } catch (e) {
        failCount++;
        progressWindow.addLines(`Error: ${e.message}`);
        Zotero.debug(`DOI Fix error: ${e}`);
      }
    }

    progressWindow.addLines(`\nCompleted: ${successCount} succeeded, ${skippedCount} skipped, ${failCount} failed`);
    progressWindow.startCloseTimer(4000);
  };

  /**
   * Retrieve DOI for a single item using CrossRef API
   */
  doiManager.retrieveDOI = async function(item, forceUpdate = false) {
    const result = await this.retrieveDOIResult(item, forceUpdate);
    return result.doi;
  };

  doiManager.retrieveDOIResult = async function(item, forceUpdate = false) {
    // Check if item already has a DOI (skip if forceUpdate is false)
    if (!forceUpdate) {
      const existingDOI = item.getField('DOI');
      if (existingDOI && existingDOI.trim()) {
        return {
          doi: this.cleanDOI(existingDOI),
          status: "existing",
          source: "existing",
          message: "Item already has a DOI",
        };
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
    return this.searchCrossrefCandidate(item, title, creators, date);
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

        const existingCheck = oldDOI ? await this.validateDOIForItem(oldDOI, item) : { valid: false, matchesItem: false };

        if (existingCheck.valid && existingCheck.matchesItem) {
          skippedCount++;
          this.clearDoiFixTags(item);
          await item.saveTx();
          progressWindow.addLines(`Existing DOI verified: ${this.cleanDOI(oldDOI)}`);
          continue;
        }

        if (oldDOI && existingCheck.valid && !existingCheck.matchesItem) {
          this.addTag(item, TAG_EXISTING_DOI_MISMATCH);
          progressWindow.addLines("Existing DOI is valid but does not match this item");
        }

        // Force update DOI only after the existing DOI fails item-level verification.
        const result = await this.retrieveDOIResult(item, true);

        if (result.doi) {
          const cleanOldDOI = this.cleanDOI(oldDOI);

          if (cleanOldDOI === result.doi) {
            skippedCount++;
            this.clearDoiFixTags(item);
            await item.saveTx();
            progressWindow.addLines(`DOI unchanged: ${result.doi}`);
          } else {
            this.backupOldDOI(item, oldDOI);
            item.setField('DOI', result.doi);
            this.clearDoiFixTags(item);
            await item.saveTx();
            successCount++;
            progressWindow.addLines(`Updated DOI: ${result.doi} (${result.source})`);
          }
        } else {
          failCount++;
          this.tagSearchFailure(item, result.status);
          await item.saveTx();
          progressWindow.addLines(`No DOI written: ${result.message}`);
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
  doiManager.searchCrossref = async function(item, title, creators, date) {
    const result = await this.searchCrossrefCandidate(item, title, creators, date);
    return result.doi;
  };

  doiManager.searchCrossrefCandidate = async function(item, title, creators, date) {
    const openURLResult = await this.searchCrossrefOpenURL(item);

    if (openURLResult.status === "resolved") {
      return openURLResult;
    }

    if (openURLResult.status === "multiresolved") {
      Zotero.debug(`DOI Fix: Crossref returned multiple DOI candidates for "${title}"`);
      return {
        doi: null,
        status: "multiple-candidates",
        source: "crossref-openurl",
        message: "Crossref returned multiple possible DOIs",
      };
    }

    return this.searchCrossrefRestCandidate(title, creators, date);
  };

  doiManager.searchCrossrefOpenURL = async function(item) {
    if (!Zotero.OpenURL || !Zotero.OpenURL.createContextObject) {
      return { status: "unavailable", doi: null };
    }

    const contextObject = Zotero.OpenURL.createContextObject(item, "1.0");

    if (!contextObject) {
      return { status: "unavailable", doi: null };
    }

    const url = `https://www.crossref.org/openurl?pid=doi-fix@zotero.org&${contextObject}&multihit=true`;

    try {
      const response = await Zotero.HTTP.request('GET', url, {
        headers: {
          'User-Agent': `Zotero DOI Fix/${config.version}`
        }
      });

      const mainWindow = Zotero.getMainWindow && Zotero.getMainWindow();
      const DOMParserCtor = mainWindow && mainWindow.DOMParser;

      if (!DOMParserCtor) {
        return { status: "unavailable", doi: null };
      }

      const parser = new DOMParserCtor();
      const xml = parser.parseFromString(response.response, "application/xml");
      const query = xml.getElementsByTagName("query")[0];

      if (!query) {
        return { status: "unavailable", doi: null };
      }

      const status = query.getAttribute("status") || "unavailable";

      if (status !== "resolved") {
        return { status, doi: null };
      }

      const doiNode = query.getElementsByTagName("doi")[0];
      const doi = doiNode && doiNode.textContent ? this.cleanDOI(doiNode.textContent) : null;

      return doi
        ? { status: "resolved", doi, source: "crossref-openurl", message: "Crossref OpenURL resolved one DOI" }
        : { status: "unavailable", doi: null, source: "crossref-openurl", message: "Crossref OpenURL response had no DOI" };
    } catch (e) {
      Zotero.debug(`Crossref OpenURL error: ${e}`);
      return { status: "unavailable", doi: null };
    }
  };

  doiManager.searchCrossrefRest = async function(title, creators, date) {
    const result = await this.searchCrossrefRestCandidate(title, creators, date);
    return result.doi;
  };

  doiManager.searchCrossrefRestCandidate = async function(title, creators, date) {
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
        return {
          doi: null,
          status: "not-found",
          source: "crossref-rest",
          message: "Crossref REST returned no candidates",
        };
      }

      // Only accept a DOI when Crossref returns a high-confidence title match.
      // Never fall back to the first search result: that creates false positives.
      const items = data.message.items || [];
      let bestMatch = null;
      let bestScore = 0;

      for (const crossrefItem of items) {
        const crossrefTitle = (crossrefItem.title && crossrefItem.title[0]) || '';
        const score = this.getTitleSimilarity(title, crossrefTitle);

        if (score > bestScore) {
          bestScore = score;
          bestMatch = crossrefItem;
        }
      }

      if (bestMatch && bestScore >= MATCH_THRESHOLD) {
        return {
          doi: this.cleanDOI(bestMatch.DOI),
          status: "resolved",
          source: "crossref-rest",
          score: bestScore,
          message: `Crossref REST title match score ${bestScore.toFixed(2)}`,
        };
      }

      Zotero.debug(`DOI Fix: No confident Crossref match for "${title}" (best score: ${bestScore.toFixed(2)})`);
      return {
        doi: null,
        status: "low-confidence",
        source: "crossref-rest",
        score: bestScore,
        message: `Best Crossref REST title match score was ${bestScore.toFixed(2)}`,
      };

    } catch (e) {
      Zotero.debug(`Crossref API error: ${e}`);
      return {
        doi: null,
        status: "error",
        source: "crossref-rest",
        message: `Crossref REST error: ${e.message || e}`,
      };
    }
  };

  /**
   * Check if two titles are similar
   */
  doiManager.isSimilarTitle = function(title1, title2) {
    return this.getTitleSimilarity(title1, title2) >= WEAK_MATCH_THRESHOLD;
  };

  doiManager.getTitleSimilarity = function(title1, title2) {
    const t1 = this.normalizeTitle(title1);
    const t2 = this.normalizeTitle(title2);

    if (!t1 || !t2) {
      return 0;
    }

    if (t1 === t2) {
      return 1;
    }

    const tokens1 = this.getTitleTokens(t1);
    const tokens2 = this.getTitleTokens(t2);

    if (tokens1.length === 0 || tokens2.length === 0) {
      return 0;
    }

    const tokenSet1 = new Set(tokens1);
    const tokenSet2 = new Set(tokens2);
    const common = tokens1.filter(token => tokenSet2.has(token)).length;
    const precision = common / tokens1.length;
    const recall = common / tokens2.length;
    const overlap = common / Math.min(tokens1.length, tokens2.length);
    const jaccard = common / new Set(tokens1.concat(tokens2)).size;

    const shorterLength = Math.min(tokens1.length, tokens2.length);
    const longerLength = Math.max(tokens1.length, tokens2.length);

    if (overlap === 1 && Math.abs(tokens1.length - tokens2.length) <= 2) {
      return Math.max(0.94, jaccard);
    }

    if (overlap === 1 && shorterLength >= 5 && longerLength / shorterLength <= 2) {
      return Math.max(0.9, jaccard);
    }

    const charSimilarity = this.getLevenshteinSimilarity(t1, t2);
    const balancedTokenScore = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

    return Math.max(charSimilarity, balancedTokenScore, jaccard);
  };

  doiManager.normalizeTitle = function(title) {
    return (title || '').toLowerCase()
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  doiManager.getTitleTokens = function(title) {
    return this.normalizeTitle(title)
      .split(' ')
      .filter(token => token.length > 1);
  };

  doiManager.getLevenshteinSimilarity = function(str1, str2) {
    const maxLength = Math.max(str1.length, str2.length);

    if (maxLength === 0) {
      return 1;
    }

    if (maxLength > 300) {
      str1 = str1.substring(0, 300);
      str2 = str2.substring(0, 300);
    }

    const distance = this.getLevenshteinDistance(str1, str2);
    return 1 - (distance / Math.max(str1.length, str2.length));
  };

  doiManager.getLevenshteinDistance = function(str1, str2) {
    const previous = Array(str2.length + 1);
    const current = Array(str2.length + 1);

    for (let j = 0; j <= str2.length; j++) {
      previous[j] = j;
    }

    for (let i = 1; i <= str1.length; i++) {
      current[0] = i;

      for (let j = 1; j <= str2.length; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + cost
        );
      }

      for (let j = 0; j <= str2.length; j++) {
        previous[j] = current[j];
      }
    }

    return previous[str2.length];
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
    doi = this.cleanDOI(doi);

    if (!doi) {
      return false;
    }

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

  doiManager.validateDOIForItem = async function(doi, item) {
    const cleanDOI = this.cleanDOI(doi);

    if (!cleanDOI) {
      return { valid: false, matchesItem: false, score: 0 };
    }

    const metadata = await this.fetchDOIMetadata(cleanDOI);

    if (!metadata.valid) {
      return { valid: false, matchesItem: false, score: 0 };
    }

    const itemTitle = item.getField('title') || '';
    const score = this.getTitleSimilarity(itemTitle, metadata.title || '');

    return {
      valid: true,
      matchesItem: score >= MATCH_THRESHOLD,
      score,
      title: metadata.title,
    };
  };

  doiManager.fetchDOIMetadata = async function(doi) {
    try {
      const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;

      const response = await Zotero.HTTP.request('GET', url, {
        headers: {
          'User-Agent': `Zotero DOI Fix/${config.version}`
        },
        successCodes: [200, 404]
      });

      if (response.status !== 200) {
        return { valid: false };
      }

      const data = JSON.parse(response.response);
      const item = data.message || {};

      return {
        valid: true,
        title: item.title && item.title[0] ? item.title[0] : '',
      };
    } catch (e) {
      Zotero.debug(`DOI metadata validation error: ${e}`);
      return { valid: false };
    }
  };

  doiManager.tagSearchFailure = function(item, status) {
    this.clearDoiFixTags(item);

    if (status === "multiple-candidates") {
      this.addTag(item, TAG_MULTIPLE_CANDIDATES);
      return;
    }

    if (status === "low-confidence") {
      this.addTag(item, TAG_LOW_CONFIDENCE);
      return;
    }

    if (status === "not-found") {
      this.addTag(item, TAG_NO_DOI);
    }
  };

  doiManager.clearDoiFixTags = function(item) {
    for (const tag of [
      TAG_NO_DOI,
      TAG_LOW_CONFIDENCE,
      TAG_MULTIPLE_CANDIDATES,
      TAG_EXISTING_DOI_MISMATCH,
    ]) {
      if (item.removeTag) {
        item.removeTag(tag);
      }
    }
  };

  doiManager.addTag = function(item, tag) {
    if (item.addTag) {
      item.addTag(tag, 1);
    }
  };

  doiManager.backupOldDOI = function(item, oldDOI) {
    const cleanOldDOI = this.cleanDOI(oldDOI);

    if (!cleanOldDOI || !item.getField || !item.setField) {
      return;
    }

    const extra = item.getField('extra') || '';
    const backupLine = `${OLD_DOI_BACKUP_PREFIX} ${cleanOldDOI}`;

    if (extra.includes(backupLine)) {
      return;
    }

    item.setField('extra', extra ? `${extra}\n${backupLine}` : backupLine);
  };

  doiManager.getRegularItems = function(items) {
    const supportedTypeIDs = SUPPORTED_ITEM_TYPES
      .map(type => Zotero.ItemTypes.getID(type))
      .filter(id => id !== false);

    return (items || []).filter(item => {
      return item.isRegularItem()
        && !item.isFeedItem
        && supportedTypeIDs.includes(item.itemTypeID);
    });
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
    doi = String(doi)
      .replace(/^\s*doi:\s*/i, '')
      .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');

    // Remove whitespace
    doi = doi.trim();

    return doi;
  };

})();
