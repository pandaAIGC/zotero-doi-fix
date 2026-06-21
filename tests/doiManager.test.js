const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const managerPath = path.join(__dirname, "..", "chrome", "content", "doiManager.js");

function makeXMLDocument(xml) {
  return {
    getElementsByTagName(name) {
      if (name !== "query") {
        return [];
      }

      const queryMatch = xml.match(/<query\b([^>]*)>([\s\S]*?)<\/query>/i);

      if (!queryMatch) {
        return [];
      }

      const attrs = queryMatch[1];
      const body = queryMatch[2];
      const statusMatch = attrs.match(/\bstatus=["']([^"']+)["']/i);

      return [{
        getAttribute(attrName) {
          return attrName === "status" && statusMatch ? statusMatch[1] : "";
        },
        getElementsByTagName(childName) {
          const childMatch = body.match(new RegExp(`<${childName}\\b[^>]*>([\\s\\S]*?)<\\/${childName}>`, "i"));
          return childMatch ? [{ textContent: childMatch[1] }] : [];
        },
      }];
    },
  };
}

class DOMParserStub {
  parseFromString(xml) {
    return makeXMLDocument(xml);
  }
}

function loadManager(options = {}) {
  const itemTypes = {
    journalArticle: 1,
    book: 2,
    webpage: 3,
  };

  const context = {
    doiManager: {},
    URLSearchParams,
    Zotero: {
      debug() {},
      OpenURL: options.openURL === false ? null : {
        createContextObject: options.createContextObject || (() => "ctx=1"),
      },
      HTTP: {
        request: options.request || (async () => ({ response: "" })),
      },
      getMainWindow() {
        return { DOMParser: DOMParserStub };
      },
      ItemTypes: {
        getID(type) {
          return Object.prototype.hasOwnProperty.call(itemTypes, type) ? itemTypes[type] : false;
        },
      },
    },
  };

  vm.createContext(context);
  vm.runInContext(fs.readFileSync(managerPath, "utf8"), context);
  return context.doiManager;
}

function makeItem(overrides = {}) {
  const fields = {
    title: "A randomized trial of aspirin in heart disease",
    DOI: "",
    date: "2024",
    extra: "",
    ...overrides.fields,
  };
  const tags = new Set(overrides.tags || []);

  return {
    itemTypeID: overrides.itemTypeID || 1,
    isFeedItem: !!overrides.isFeedItem,
    isRegularItem: () => overrides.isRegularItem !== false,
    getField(field) {
      return Object.prototype.hasOwnProperty.call(overrides, field) ? overrides[field] : fields[field];
    },
    setField(field, value) {
      fields[field] = value;
    },
    getCreators() {
      return overrides.creators || [{ lastName: "Smith" }];
    },
    addTag(tag) {
      tags.add(tag);
    },
    removeTag(tag) {
      tags.delete(tag);
    },
    hasTag(tag) {
      return tags.has(tag);
    },
    saveTx: async () => {},
    _fields: fields,
    _tags: tags,
  };
}

async function testRestDoesNotUseFirstResultFallback() {
  const manager = loadManager({
    openURL: false,
    request: async () => ({
      response: JSON.stringify({
        message: {
          items: [{
            DOI: "10.0000/wrong",
            title: ["Aspirin and cancer prevention"],
          }],
        },
      }),
    }),
  });

  const doi = await manager.searchCrossrefRest("A randomized trial of aspirin in heart disease", [], "");
  assert.strictEqual(doi, null);
}

async function testRestCanSelectLaterConfidentMatch() {
  const manager = loadManager({
    openURL: false,
    request: async () => ({
      response: JSON.stringify({
        message: {
          items: [
            {
              DOI: "10.0000/wrong",
              title: ["Aspirin and cancer prevention"],
            },
            {
              DOI: "10.0000/correct",
              title: ["A randomized trial of aspirin in heart disease"],
            },
          ],
        },
      }),
    }),
  });

  const doi = await manager.searchCrossrefRest("A randomized trial of aspirin in heart disease", [], "");
  assert.strictEqual(doi, "10.0000/correct");
}

async function testOpenURLResolvedReturnsDOI() {
  const manager = loadManager({
    request: async () => ({
      response: '<crossref_result><query status="resolved"><doi>10.0000/resolved</doi></query></crossref_result>',
    }),
  });

  const doi = await manager.searchCrossref(makeItem(), "A randomized trial of aspirin in heart disease", [], "");
  assert.strictEqual(doi, "10.0000/resolved");
}

async function testOpenURLMultiresolvedDoesNotFallbackToRest() {
  let requestCount = 0;
  const manager = loadManager({
    request: async () => {
      requestCount++;
      return {
        response: '<crossref_result><query status="multiresolved"></query></crossref_result>',
      };
    },
  });

  const doi = await manager.searchCrossref(makeItem(), "A randomized trial of aspirin in heart disease", [], "");
  assert.strictEqual(doi, null);
  assert.strictEqual(requestCount, 1);
}

function testSupportedItemFiltering() {
  const manager = loadManager();
  const items = [
    makeItem({ itemTypeID: 1 }),
    makeItem({ itemTypeID: 2 }),
    makeItem({ itemTypeID: 3 }),
    makeItem({ itemTypeID: 1, isFeedItem: true }),
    makeItem({ itemTypeID: 1, isRegularItem: false }),
  ];

  assert.deepStrictEqual(manager.getRegularItems(items), [items[0], items[1]]);
}

function testTitleSimilarityBoundaries() {
  const manager = loadManager();

  assert.strictEqual(
    manager.getTitleSimilarity(
      "A randomized trial of aspirin in heart disease",
      "A randomized trial of aspirin in heart disease"
    ),
    1
  );
  assert.ok(
    manager.getTitleSimilarity(
      "A randomized trial of aspirin in heart disease with long follow up",
      "A randomized trial of aspirin in heart disease"
    ) >= 0.86
  );
  assert.ok(
    manager.getTitleSimilarity(
      "A randomized trial of aspirin in heart disease",
      "Aspirin and cancer prevention"
    ) < 0.86
  );
}

async function testValidateDOIForItemRequiresTitleMatch() {
  const manager = loadManager({
    request: async () => ({
      status: 200,
      response: JSON.stringify({
        message: {
          title: ["Aspirin and cancer prevention"],
        },
      }),
    }),
  });

  const result = await manager.validateDOIForItem("10.0000/wrong", makeItem());
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.matchesItem, false);
}

async function testValidateDOIForItemAcceptsMatchingTitle() {
  const manager = loadManager({
    request: async () => ({
      status: 200,
      response: JSON.stringify({
        message: {
          title: ["A randomized trial of aspirin in heart disease"],
        },
      }),
    }),
  });

  const result = await manager.validateDOIForItem("https://doi.org/10.0000/correct", makeItem());
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.matchesItem, true);
}

function testBackupOldDOIAddsSingleExtraLine() {
  const manager = loadManager();
  const item = makeItem({ fields: { extra: "Existing note" } });

  manager.backupOldDOI(item, "doi:10.0000/old");
  manager.backupOldDOI(item, "10.0000/old");

  assert.strictEqual(
    item._fields.extra,
    "Existing note\nDOI Fix previous DOI: 10.0000/old"
  );
}

function testSearchFailureTagsAreSimpleAndExclusive() {
  const manager = loadManager();
  const item = makeItem({ tags: ["doi-fix:no-doi-found"] });

  manager.tagSearchFailure(item, "multiple-candidates");

  assert.strictEqual(item.hasTag("doi-fix:no-doi-found"), false);
  assert.strictEqual(item.hasTag("doi-fix:multiple-candidates"), true);
}

async function run() {
  const tests = [
    testRestDoesNotUseFirstResultFallback,
    testRestCanSelectLaterConfidentMatch,
    testOpenURLResolvedReturnsDOI,
    testOpenURLMultiresolvedDoesNotFallbackToRest,
    testSupportedItemFiltering,
    testTitleSimilarityBoundaries,
    testValidateDOIForItemRequiresTitleMatch,
    testValidateDOIForItemAcceptsMatchingTitle,
    testBackupOldDOIAddsSingleExtraLine,
    testSearchFailureTagsAreSimpleAndExclusive,
  ];

  for (const test of tests) {
    await test();
    console.log(`PASS ${test.name}`);
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
