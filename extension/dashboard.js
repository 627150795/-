(async function () {
  let state = await AIWorkstream.getState();
  let selectedId = state.ideas[0]?.id || null;

  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (text) => String(text || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
  const daysSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  const typeName = {
    product_idea: "产品",
    research: "研究",
    writing: "写作",
    learning: "学习",
    automation: "自动化",
    business: "商业",
    personal_system: "个人系统",
    other: "其他"
  };

  function render() {
    state.ideas.forEach((idea) => { idea.attention = AIWorkstream.attention(idea); });
    state.ideas.sort((a, b) => b.attention - a.attention);
    const visibleIdeas = state.ideas.filter((idea) => !idea.dismissed);
    const hot = visibleIdeas.filter((idea) => idea.attention >= 70).length;
    const cooling = visibleIdeas.filter((idea) => idea.attention < 40).length;
    $("#stats").innerHTML = [
      ["想法总数", visibleIdeas.length],
      ["高注意力", hot],
      ["正在冷却", cooling],
      ["已收录对话", state.conversations.length]
    ].map(([label, value]) => `<article class="stat"><span>${label}</span><strong>${value}</strong></article>`).join("");

    $("#toggle-auto").textContent = state.settings.autoCapture ? "自动采集：开" : "自动采集：关";
    $("#toggle-model").textContent = state.settings.useModelAnalyzer ? "小模型：开" : "小模型：关";
    $("#idea-map").innerHTML = visibleIdeas.length ? visibleIdeas.map((idea) => {
      const size = Math.max(58, Math.min(170, 48 + idea.attention * 1.15));
      const age = daysSince(idea.lastSeenAt);
      const freshness = age === 0 ? "今天" : `${age}天前`;
      return `<button class="idea-ball ${idea.progressing ? "progressing" : ""} ${selectedId === idea.id ? "selected" : ""}" data-id="${idea.id}" style="width:${size}px;height:${size}px">
        <b>${escapeHtml(idea.title)}</b>
        <span>${idea.attention}</span>
        <em>${freshness}</em>
      </button>`;
    }).join("") : `<div class="empty">打开 ChatGPT 或 Gemini 页面后，扩展会自动筛选值得跟进的想法。</div>`;

    const selected = visibleIdeas.find((idea) => idea.id === selectedId) || visibleIdeas[0];
    selectedId = selected?.id || null;
    $("#idea-detail").innerHTML = selected ? detailHtml(selected) : "还没有选中想法。";

    $("#recent-list").innerHTML = visibleIdeas.slice(0, 8).map((idea) =>
      `<article class="recent">
        <div><b>${escapeHtml(idea.title)}</b><p>${escapeHtml(idea.summary)}</p></div>
        <span>${idea.attention}</span>
      </article>`
    ).join("") || `<div class="empty">暂无收录。</div>`;
  }

  function detailHtml(idea) {
    const why = (idea.whySaved || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    return `<article class="detail">
      <div class="badge">${typeName[idea.type] || "其他"} · ${idea.score}分</div>
      <h3>${escapeHtml(idea.title)}</h3>
      <p>${escapeHtml(idea.summary || "暂无摘要。")}</p>
      <h4>最近动静</h4>
      <ul>${traceHtml(idea)}</ul>
      <h4>为什么留下</h4>
      <ul>${why || "<li>规则或模型判断该内容值得未来再次关注。</li>"}</ul>
      <div class="meta">${idea.progressing ? "正在推进" : "普通想法"} · 出现 ${idea.touchCount || 1} 次 · 来源 ${idea.sourceIds?.length || 0} 段对话 · 最近 ${daysSince(idea.lastSeenAt)} 天前</div>
      <button data-action="dismiss" data-id="${idea.id}" class="secondary">不再关注</button>
    </article>`;
  }

  function traceHtml(idea) {
    const traces = (idea.traces || []).slice(0, 3);
    if (!traces.length) return "<li>暂无轨迹。</li>";
    return traces.map((trace) => `<li>${escapeHtml(trace.text).slice(0, 30)}</li>`).join("");
  }

  document.addEventListener("click", async (event) => {
    const ball = event.target.closest(".idea-ball");
    if (ball) {
      selectedId = ball.dataset.id;
      render();
      return;
    }
    if (event.target.id === "seed-demo") {
      state = await AIWorkstream.setState(AIWorkstream.demoState());
      selectedId = state.ideas[0]?.id;
      render();
      return;
    }
    if (event.target.id === "clear-data") {
      state = await AIWorkstream.setState({ conversations: [], ideas: [], settings: state.settings });
      selectedId = null;
      render();
      return;
    }
    if (event.target.id === "toggle-auto") {
      state.settings.autoCapture = !state.settings.autoCapture;
      state = await AIWorkstream.setState(state);
      render();
      return;
    }
    if (event.target.id === "toggle-model") {
      state.settings.useModelAnalyzer = !state.settings.useModelAnalyzer;
      state = await AIWorkstream.setState(state);
      render();
      return;
    }
    if (event.target.dataset.action === "dismiss") {
      state = await AIWorkstream.updateIdea(event.target.dataset.id, { dismissed: true });
      selectedId = state.ideas.find((idea) => !idea.dismissed)?.id || null;
      render();
    }
  });

  render();
})();
