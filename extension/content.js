(function () {
  const platform = location.hostname.includes("chatgpt") ? "ChatGPT"
    : location.hostname.includes("gemini") ? "Gemini"
      : "Claude";

  const AUTO_CAPTURE_DELAY_MS = 8000;
  const MIN_MESSAGES = 2;

  const selectors = {
    ChatGPT: [
      { selector: '[data-message-author-role="user"]', role: "user" },
      { selector: '[data-message-author-role="assistant"]', role: "assistant" },
      { selector: '[data-testid^="conversation-turn-"]', role: "assistant" },
      { selector: "article", role: "assistant" },
      { selector: ".markdown", role: "assistant" },
      { selector: ".prose", role: "assistant" }
    ],
    Gemini: [
      { selector: "user-query", role: "user" },
      { selector: "model-response", role: "assistant" },
      { selector: ".query-text", role: "user" },
      { selector: ".model-response-text", role: "assistant" }
    ],
    Claude: [
      { selector: '[data-testid="user-message"]', role: "user" },
      { selector: '[data-is-streaming="false"]', role: "assistant" },
      { selector: ".font-claude-response", role: "assistant" }
    ]
  };

  let timer = null;
  let lastSignature = "";
  let lastUrl = location.href;
  let capturing = false;

  function collectMessages() {
    const found = [];
    selectors[platform].forEach(({ selector, role }) => {
      document.querySelectorAll(selector).forEach((element) => {
        const text = element.innerText?.trim();
        if (!text || element.closest("#ai-workstream-capture")) return;
        if (text.length < 2) return;
        found.push({ role, text, order: element.getBoundingClientRect().top + window.scrollY });
      });
    });
    return found
      .sort((a, b) => a.order - b.order)
      .filter((item, index, all) => index === 0 || item.text !== all[index - 1].text)
      .map(({ role, text }) => ({ role, text }));
  }

  function captureQuality(messages) {
    const userCount = messages.filter((m) => m.role === "user").length;
    const assistantCount = messages.filter((m) => m.role === "assistant").length;
    const chars = messages.reduce((sum, m) => sum + m.text.length, 0);
    const hasConversationPair = messages.length >= MIN_MESSAGES && userCount >= 1 && assistantCount >= 1 && chars >= 80;
    const hasLongVisibleAnswer = assistantCount >= 1 && chars >= 450;
    return {
      ok: hasConversationPair || hasLongVisibleAnswer,
      userCount,
      assistantCount,
      chars,
      mode: hasConversationPair ? "paired" : hasLongVisibleAnswer ? "visible-answer" : "too-small"
    };
  }

  function localSignature(messages) {
    return `${location.href}|${messages.map((m) => `${m.role}:${m.text}`).join("|")}`.slice(-12000);
  }

  async function capture(reason) {
    if (capturing) return;
    const messages = collectMessages();
    const quality = captureQuality(messages);
    updateCounts(quality);
    if (!quality.ok) {
      if (reason === "manual") setStatus(`Too little content ${quality.userCount}/${quality.assistantCount}`, "error");
      return;
    }

    const signature = localSignature(messages);
    if (signature === lastSignature && reason === "auto") return;
    lastSignature = signature;
    capturing = true;
    setStatus(reason === "auto" ? "Auto analyzing..." : "Analyzing...", "working");
    try {
      const result = await AIWorkstream.ingest({
        platform,
        title: document.title,
        url: location.href,
        messages,
        captureQuality: quality
      });
      await refreshMiniStats();
      if (result.duplicate) setStatus("Already saved", "neutral");
      else if (result.saved) setStatus(`Idea saved ${result.analysis.score}`, "success");
      else setStatus(`Ignored ${result.analysis.score}`, "neutral");
    } catch (error) {
      setStatus("Analyze failed", "error");
    } finally {
      capturing = false;
    }
  }

  async function scheduleAutoCapture() {
    const state = await AIWorkstream.getState();
    if (!state.settings.autoCapture) return;
    if (lastUrl !== location.href) {
      lastUrl = location.href;
      lastSignature = "";
    }
    clearTimeout(timer);
    timer = setTimeout(() => capture("auto"), AUTO_CAPTURE_DELAY_MS);
  }

  function setStatus(text, state) {
    const status = document.querySelector("#ai-workstream-capture .aw-status");
    if (!status) return;
    status.textContent = text;
    status.dataset.state = state;
  }

  function updateCounts(quality) {
    const node = document.querySelector("#ai-workstream-capture .aw-page-count");
    if (node) node.textContent = `${quality.userCount} user / ${quality.assistantCount} AI`;
  }

  async function refreshMiniStats() {
    const state = await AIWorkstream.getState();
    const ideas = state.ideas.filter((idea) => !idea.dismissed);
    const hot = ideas.filter((idea) => AIWorkstream.attention(idea) >= 70);
    const ideasNode = document.querySelector("#ai-workstream-capture .aw-ideas");
    const hotNode = document.querySelector("#ai-workstream-capture .aw-hot");
    if (ideasNode) ideasNode.textContent = String(ideas.length);
    if (hotNode) hotNode.textContent = String(hot.length);
  }

  function openDashboard() {
    window.open(chrome.runtime.getURL("dashboard.html"), "_blank", "noopener,noreferrer");
  }

  function mount() {
    if (document.querySelector("#ai-workstream-capture")) return;
    const shell = document.createElement("div");
    shell.id = "ai-workstream-capture";
    shell.className = "aw-collapsed";
    shell.innerHTML = `
      <button class="aw-tab" type="button" title="AI Workstream">AW</button>
      <section class="aw-panel" aria-label="AI Workstream">
        <div class="aw-head">
          <div>
            <strong>AI Workstream</strong>
            <span>${platform} capture</span>
          </div>
          <button class="aw-hide" type="button" title="Hide">×</button>
        </div>
        <div class="aw-status" data-state="neutral">Waiting for page updates</div>
        <div class="aw-grid">
          <div><b class="aw-ideas">0</b><span>Ideas</span></div>
          <div><b class="aw-hot">0</b><span>Hot</span></div>
        </div>
        <div class="aw-page-count">0 user / 0 AI</div>
        <button class="aw-primary" type="button">Analyze this chat</button>
        <button class="aw-secondary" type="button">Open idea map</button>
      </section>
    `;
    shell.querySelector(".aw-tab").addEventListener("click", () => shell.classList.remove("aw-collapsed"));
    shell.querySelector(".aw-hide").addEventListener("click", () => shell.classList.add("aw-collapsed"));
    shell.querySelector(".aw-primary").addEventListener("click", () => capture("manual"));
    shell.querySelector(".aw-secondary").addEventListener("click", openDashboard);
    document.body.appendChild(shell);
    refreshMiniStats();
  }

  mount();
  new MutationObserver(() => {
    mount();
    scheduleAutoCapture();
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  window.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleAutoCapture();
  });
  setTimeout(() => capture("auto"), 2500);
  setTimeout(scheduleAutoCapture, 9000);
})();
