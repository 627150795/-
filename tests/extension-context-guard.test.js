const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "extension", "shared.js"), "utf8");

assert.match(source, /isExtensionContextError/, "shared storage should detect invalidated extension contexts");
assert.match(source, /Extension context invalidated/i, "guard should match Chrome extension reload errors");
assert.match(source, /catch \(error\)[\s\S]*isExtensionContextError\(error\)/, "chrome.storage access should be guarded");
assert.match(source, /localStorage\.setItem\(STORAGE_KEY/, "state writes should fall back after extension context invalidation");

console.log("extension context guard tests passed");
