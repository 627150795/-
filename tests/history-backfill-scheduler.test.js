const assert = require("assert");
const fs = require("fs");
const path = require("path");

const content = fs.readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");
const shared = fs.readFileSync(path.join(__dirname, "..", "extension", "shared.js"), "utf8");

assert.match(shared, /autoHistoryBackfill: true/, "history backfill should be enabled by default");
assert.match(content, /HISTORY_BACKFILL_LIMIT = 20/, "auto history backfill should use the same recent-20 scope as the MVP button");
assert.match(content, /HISTORY_BACKFILL_INTERVAL_MS = 10 \* 60 \* 1000/, "auto history backfill needs a throttle interval");
assert.match(content, /HISTORY_BACKFILL_INITIAL_DELAY_MS = 12000/, "auto history backfill should start shortly after ChatGPT loads");
assert.match(content, /function maybeAutoBackfillHistory/, "content script should have an automatic history scan entrypoint");
assert.match(content, /function scheduleHistoryBackfillLoop/, "content script should schedule periodic history scans");
assert.match(content, /claimHistoryBackfill/, "history scans should use a cross-tab freshness lock");
assert.match(content, /historyBackfill/, "history scan status should be stored for later runs");
assert.match(content, /backfillRecent\(HISTORY_BACKFILL_LIMIT, \{ auto: true/, "scheduled scans should call backfill without user clicks");

console.log("history backfill scheduler tests passed");
