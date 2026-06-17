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
  let progressTimer = null;
  let backfilling = false;

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
    setProgress(22, reason === "auto" ? "Auto scan: reading page" : "Manual scan: reading page", "working");
    const messages = collectMessages();
    const quality = captureQuality(messages);
    updateCounts(quality);
    if (!quality.ok) {
      setProgress(100, `Skipped: ${quality.mode}`, reason === "manual" ? "error" : "neutral");
      return;
    }

    const signature = localSignature(messages);
    if (signature === lastSignature && reason === "auto") {
      setProgress(100, "No new page changes", "neutral");
      return;
    }
    lastSignature = signature;
    capturing = true;
    setProgress(48, `Read ${quality.chars} chars`, "working");
    try {
      setProgress(72, "Analyzing idea value", "working");
      const result = await AIWorkstream.ingest({
        platform,
        title: document.title,
        url: location.href,
        messages,
        captureQuality: quality
      });
      await refreshMiniStats();
      if (result.duplicate) setProgress(100, "Already saved", "neutral");
      else if (result.saved) setProgress(100, `Idea saved ${result.analysis.score}`, "success");
      else setProgress(100, `Ignored ${result.analysis.score}`, "neutral");
    } catch (error) {
      setProgress(100, "Analyze failed", "error");
    } finally {
      capturing = false;
    }
  }

  async function backfillRecent(limit = 20) {
    if (platform !== "ChatGPT") {
      setProgress(100, "Backfill only supports ChatGPT now", "error");
      return;
    }
    if (backfilling) return;
    backfilling = true;
    try {
      setProgress(8, "Loading recent chat history", "working");
      const metas = await fetchRecentChatGPTMetas(limit);
      if (!metas.length) {
        setProgress(100, "No history found", "neutral");
        return;
      }
      let saved = 0;
      let scanned = 0;
      for (const meta of metas) {
        scanned += 1;
        setProgress(Math.round((scanned / metas.length) * 80) + 10, `Backfill ${scanned}/${metas.length}`, "working");
        const conversation = await fetchChatGPTConversation(meta.id);
        if (!conversation.messages.length) continue;
        const result = await AIWorkstream.ingest({
          platform: "ChatGPT",
          title: conversation.title || meta.title || "ChatGPT history",
          url: `https://chatgpt.com/c/${meta.id}`,
          messages: conversation.messages,
          captureQuality: {
            ok: true,
            userCount: conversation.messages.filter((m) => m.role === "user").length,
            assistantCount: conversation.messages.filter((m) => m.role === "assistant").length,
            chars: conversation.messages.reduce((sum, m) => sum + m.text.length, 0),
            mode: "history-api"
          }
        });
        if (result.saved) saved += 1;
      }
      await refreshMiniStats();
      setProgress(100, `Backfill done: ${saved}/${metas.length} ideas`, saved ? "success" : "neutral");
    } catch (error) {
      setProgress(100, "Backfill failed", "error");
    } finally {
      backfilling = false;
    }
  }

  async function fetchRecentChatGPTMetas(limit) {
    const response = await fetch(`https://chatgpt.com/backend-api/conversations?offset=0&limit=${limit}&order=updated`, {
      credentials: "include"
    });
    if (!response.ok) throw new Error(`History API ${response.status}`);
    const data = await response.json();
    return (Array.isArray(data.items) ? data.items : [])
      .map((item) => ({
        id: String(item.id || item.conversation_id || "").trim(),
        title: String(item.title || "Untitled Chat").trim(),
        updatedAt: item.update_time || item.updated_at || null
      }))
      .filter((item) => item.id);
  }

  async function fetchChatGPTConversation(id) {
    const response = await fetch(`https://chatgpt.com/backend-api/conversation/${id}`, {
      credentials: "include"
    });
    if (!response.ok) throw new Error(`Conversation API ${response.status}`);
    const raw = await response.json();
    return normalizeChatGPTConversation(raw, id);
  }

  function normalizeChatGPTConversation(raw, fallbackId) {
    const mapping = raw?.mapping && typeof raw.mapping === "object" ? raw.mapping : {};
    const nodes = Object.values(mapping);
    const idSet = new Set(Object.keys(mapping));
    const roots = nodes.filter((node) => !node?.parent || !idSet.has(node.parent));
    const visited = new Set();
    const messages = [];

    function walk(node) {
      if (!node || visited.has(node.id)) return;
      visited.add(node.id);
      const message = normalizeChatGPTMessage(node);
      if (message) messages.push(message);
      const children = Array.isArray(node.children) ? node.children : [];
      const lastChild = children[children.length - 1];
      if (lastChild && mapping[lastChild]) walk(mapping[lastChild]);
    }

    roots.forEach(walk);
    return {
      id: String(raw?.id || raw?.conversation_id || fallbackId),
      title: String(raw?.title || "Untitled Chat"),
      messages
    };
  }

  function normalizeChatGPTMessage(node) {
    const raw = node?.message;
    if (!raw) return null;
    const role = String(raw.author?.role || "");
    if (!["user", "assistant"].includes(role)) return null;
    const text = extractChatGPTText(raw.content);
    if (!text) return null;
    return { role, text };
  }

  function extractChatGPTText(content) {
    if (!content) return "";
    if (typeof content === "string") return content.trim();
    if (content.content_type === "text") {
      return (Array.isArray(content.parts) ? content.parts : [])
        .map((part) => typeof part === "string" ? part : part?.text || "")
        .join("")
        .trim();
    }
    if (content.content_type === "multimodal_text") {
      return (Array.isArray(content.parts) ? content.parts : [])
        .map((part) => typeof part === "string" ? part : "")
        .join("")
        .trim();
    }
    if (content.content_type === "code") return String(content.text || "").trim();
    return "";
  }

  async function scheduleAutoCapture() {
    const state = await AIWorkstream.getState();
    if (!state.settings.autoCapture) return;
    if (lastUrl !== location.href) {
      lastUrl = location.href;
      lastSignature = "";
    }
    clearTimeout(timer);
    showCountdown(AUTO_CAPTURE_DELAY_MS);
    timer = setTimeout(() => capture("auto"), AUTO_CAPTURE_DELAY_MS);
  }

  function setProgress(percent, text, state) {
    const status = document.querySelector("#ai-workstream-capture .aw-status");
    const fill = document.querySelector("#ai-workstream-capture .aw-progress-fill");
    if (status) {
      status.textContent = text;
      status.dataset.state = state;
    }
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    clearTimeout(progressTimer);
    if (percent >= 100 && state !== "working") {
      progressTimer = setTimeout(() => {
        const nextStatus = document.querySelector("#ai-workstream-capture .aw-status");
        const nextFill = document.querySelector("#ai-workstream-capture .aw-progress-fill");
        if (nextStatus) {
          nextStatus.textContent = "Watching for page changes";
          nextStatus.dataset.state = "neutral";
        }
        if (nextFill) nextFill.style.width = "0%";
      }, 4500);
    }
  }

  function showCountdown(delayMs) {
    const seconds = Math.round(delayMs / 1000);
    setProgress(8, `Page changed. Scanning in ${seconds}s`, "working");
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
        <div class="aw-status" data-state="neutral">Watching for page changes</div>
        <div class="aw-progress"><i class="aw-progress-fill"></i></div>
        <div class="aw-grid">
          <div><b class="aw-ideas">0</b><span>Ideas</span></div>
          <div><b class="aw-hot">0</b><span>Hot</span></div>
        </div>
        <div class="aw-page-count">0 user / 0 AI</div>
        <button class="aw-primary" type="button">Analyze this chat</button>
        <button class="aw-backfill" type="button">Backfill recent 20</button>
        <button class="aw-secondary" type="button">Open idea map</button>
      </section>
    `;
    shell.querySelector(".aw-tab").addEventListener("click", () => shell.classList.remove("aw-collapsed"));
    shell.querySelector(".aw-hide").addEventListener("click", () => shell.classList.add("aw-collapsed"));
    shell.querySelector(".aw-primary").addEventListener("click", () => capture("manual"));
    shell.querySelector(".aw-backfill").addEventListener("click", () => backfillRecent(20));
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
