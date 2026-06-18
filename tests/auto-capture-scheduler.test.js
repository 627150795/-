const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");

assert.match(source, /AUTO_CAPTURE_MAX_WAIT_MS/, "auto capture needs a max wait guard so ChatGPT DOM churn cannot postpone scans forever");
assert.match(source, /firstMutationAt/, "scheduler should remember when the current noisy DOM burst started");
assert.match(source, /Waiting for page to settle/, "status text should say it is waiting, not pretend the 8s countdown is progressing");
assert.match(source, /Max wait reached/, "status text should reveal when scan is forced after noisy DOM changes");

console.log("auto capture scheduler tests passed");
