const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "extension", "shared.js"), "utf8");
const contentSource = fs.readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");

assert.match(source, /isExtensionContextError/, "shared storage should detect invalidated extension contexts");
assert.match(source, /Extension context invalidated/i, "guard should match Chrome extension reload errors");
assert.match(source, /catch \(error\)[\s\S]*isExtensionContextError\(error\)/, "chrome.storage access should be guarded");
assert.match(source, /localStorage\.setItem\(STORAGE_KEY/, "state writes should fall back after extension context invalidation");
assert.match(source, /isExtensionContextInvalid/, "shared module should expose invalid context state");
assert.match(contentSource, /stopForExtensionReload/, "content script should stop timers after extension reload");
assert.match(contentSource, /Extension reloaded\. Refresh this page/, "content script should show a clear refresh-page status");

console.log("extension context guard tests passed");
