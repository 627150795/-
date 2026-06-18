const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "analyzer-server.js"), "utf8");

assert.match(source, /loadDotEnv/, "analyzer should load local .env without committing secrets");
assert.match(source, /deepseek-ai\/DeepSeek-V4-Flash/, "analyzer should default to the selected SiliconFlow model");
assert.match(source, /想法注意力管理器/, "analyzer prompt should contain readable Chinese, not mojibake");
assert.match(source, /必须拒绝/, "analyzer prompt should keep explicit rejection rules");
assert.match(source, /怎么安装\|在哪里打开/, "hard gate should reject install/open-page support requests");
assert.match(source, /扩展程序有报错/, "hard gate should reject extension bug reports as idea balls");
assert.doesNotMatch(source, /鎴|浣犳槸|蹇呴』|涓€/, "analyzer should not contain mojibake Chinese prompt text");

console.log("analyzer server tests passed");
