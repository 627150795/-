const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");

assert.match(source, /function collectChatGPTMessages/, "ChatGPT should use a dedicated collector");
assert.match(source, /data-message-author-role="user"/, "collector should read user role nodes");
assert.match(source, /data-message-author-role="assistant"/, "collector should read assistant role nodes");
assert.match(source, /if \(roleMessages\.length\) return roleMessages;/, "role nodes should win before fallback selectors");
assert.match(source, /collectChatGPTFallbackMessages/, "fallback should be separate from role-based collection");

console.log("chatgpt collector tests passed");
