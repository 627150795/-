(async function () {
  const state = await AIWorkstream.getState();
  const ideas = state.ideas.filter((idea) => !idea.dismissed).length;
  const hot = state.ideas.filter((idea) => !idea.dismissed && AIWorkstream.attention(idea) >= 70).length;
  document.querySelector("#summary").textContent = `${ideas} 个想法，${hot} 个高注意力；自动采集${state.settings.autoCapture ? "已开启" : "未开启"}。`;
  document.querySelector("#open-dashboard").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  });
})();
