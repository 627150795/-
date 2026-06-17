const DIGEST_ALARM = "ai-workstream-digest";

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.alarms.create(DIGEST_ALARM, { periodInMinutes: 1440 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== DIGEST_ALARM) return;
  const result = await chrome.storage.local.get("aiWorkstreamState");
  const state = result.aiWorkstreamState;
  const ideas = (state?.ideas || []).filter((idea) => !idea.dismissed);
  const hot = ideas.filter((idea) => (idea.attention || idea.score || 0) >= 70);
  if (!ideas.length) return;
  chrome.notifications.create({
    type: "basic",
    iconUrl: chrome.runtime.getURL("icon.svg"),
    title: "AI Workstream 想法回看",
    message: `${hot.length} 个高注意力想法，${ideas.length} 个近期想法等待回看。`
  });
});
