(function (root) {
  const STORAGE_KEY = "aiWorkstreamState";
  const ANALYZER_URL = "http://127.0.0.1:8787/analyze";
  const EMPTY_STATE = {
    conversations: [],
    ideas: [],
    settings: { autoCapture: true, useModelAnalyzer: true, minScore: 55 }
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const compact = (text) => String(text || "").replace(/\s+/g, " ").trim();
  const fingerprint = (text) => {
    const source = compact(text).toLowerCase();
    let hash = 0;
    for (let i = 0; i < source.length; i += 1) hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0;
    return `${source.length}:${hash}:${source.slice(0, 80)}:${source.slice(-80)}`;
  };

  async function getState() {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      return normalizeState(result[STORAGE_KEY]);
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    return normalizeState(saved ? JSON.parse(saved) : null);
  }

  function normalizeState(raw) {
    const state = { ...clone(EMPTY_STATE), ...(raw || {}) };
    if (!Array.isArray(state.ideas)) state.ideas = [];
    if (!Array.isArray(state.conversations)) state.conversations = [];
    state.settings = { ...clone(EMPTY_STATE.settings), ...(state.settings || {}) };
    return state;
  }

  async function setState(state) {
    const normalized = normalizeState(state);
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }
    return normalized;
  }

  function roughScore(messages) {
    const text = compact(messages.map((m) => `${m.role}: ${m.text}`).join("\n"));
    const userText = compact(messages.filter((m) => m.role === "user").map((m) => m.text).join("\n"));
    const positive = [
      /我(现在)?有个想法|我想做|我在想|我觉得|我的需求|能不能做|可不可行|怎么落地|怎么验证/g,
      /产品|创业|工具|app|插件|自动化|工作流|MVP|原型|商业|推广|用户|竞品|市场/g,
      /研究|写作|选题|课程|学习计划|投资假设|个人系统|知识库/g,
      /下一步|需要验证|值得跟进|还没解决|阻塞|风险|方案|架构/g
    ];
    const negative = [
      /翻译|润色|改写|格式化|总结这段|讲个笑话|附近|天气|汇率|怎么做菜/g,
      /^(帮我)?(翻译|润色|改写|解释)一下/g
    ];
    let score = Math.min(30, Math.floor(text.length / 120));
    positive.forEach((pattern) => { score += ((text.match(pattern) || []).length * 10); });
    negative.forEach((pattern) => { score -= ((userText.match(pattern) || []).length * 18); });
    if (/我.*想法|我想做|我的需求|能不能做/.test(userText)) score += 18;
    if (/采集|筛选|可视化|MVP|插件|产品/.test(text)) score += 12;
    if (messages.filter((m) => m.role === "user").length >= 3) score += 12;
    return Math.max(0, Math.min(100, score));
  }

  function fallbackAnalyze(payload) {
    const messages = payload.messages;
    const score = roughScore(messages);
    const userText = compact(messages.filter((m) => m.role === "user").map((m) => m.text).join(" "));
    const title = makeTitle(payload.title, userText);
    const shouldSave = score >= 55;
    return {
      should_save: shouldSave,
      idea_title: shouldSave ? title : null,
      summary: shouldSave ? compact(userText).slice(0, 90) : null,
      idea_type: inferType(userText),
      score,
      why_saved: shouldSave ? ["有想法探索信号", "有后续跟进价值"] : [],
      next_step: shouldSave ? "继续观察这个点子是否被再次推进。" : null,
      noise_reason: shouldSave ? null : "更像一次性问题或工具请求"
    };
  }

  function makeTitle(pageTitle, text) {
    const cleaned = compact(pageTitle || "")
      .replace(/^(ChatGPT|Gemini|Claude)\s*[-:|]?\s*/i, "")
      .replace(/\s*[-|]\s*(ChatGPT|Gemini|Claude).*$/i, "");
    if (cleaned && cleaned.length >= 4) return cleaned.slice(0, 24);
    const match = text.match(/(?:我有个想法|我想做|能不能做|可不可以做|想做一个)(.{4,32})/);
    return compact(match?.[1] || text).slice(0, 24) || "未命名想法";
  }

  function inferType(text) {
    if (/产品|app|插件|工具|MVP|用户|竞品|推广/.test(text)) return "product_idea";
    if (/自动化|工作流|脚本|接口|API/.test(text)) return "automation";
    if (/研究|论文|调研|验证/.test(text)) return "research";
    if (/写作|文章|视频|选题|内容/.test(text)) return "writing";
    if (/学习|课程|训练|知识/.test(text)) return "learning";
    if (/商业|赚钱|市场|客户/.test(text)) return "business";
    return "other";
  }

  async function modelAnalyze(payload, settings) {
    if (!settings.useModelAnalyzer) return fallbackAnalyze(payload);
    try {
      const response = await fetch(ANALYZER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: payload.platform,
          title: payload.title,
          url: payload.url,
          messages: payload.messages.slice(-24),
          captureQuality: payload.captureQuality || null
        })
      });
      if (!response.ok) throw new Error(`Analyzer ${response.status}`);
      const data = await response.json();
      if (typeof data.should_save !== "boolean" || typeof data.score !== "number") throw new Error("Bad analyzer JSON");
      return data;
    } catch (_) {
      return fallbackAnalyze(payload);
    }
  }

  function similarIdea(a, b) {
    const left = new Set(compact(a).toLowerCase().split(/[\s,，。:：、\-]+/).filter((x) => x.length > 1));
    const right = new Set(compact(b).toLowerCase().split(/[\s,，。:：、\-]+/).filter((x) => x.length > 1));
    if (!left.size || !right.size) return false;
    let overlap = 0;
    left.forEach((word) => { if (right.has(word)) overlap += 1; });
    return overlap / Math.min(left.size, right.size) >= 0.45 || fingerprint(a) === fingerprint(b);
  }

  function progressSignal(messages) {
    const text = compact(messages.map((m) => m.text).join(" "));
    return /做了|实现了|跑通了|测试了|验证了|改成|已经|新版|下一版|继续完善|修复|上线|部署|整理出|决定采用/.test(text);
  }

  function attention(idea, now = Date.now()) {
    const ageDays = Math.max(0, (now - new Date(idea.lastSeenAt).getTime()) / 86400000);
    const decay = Math.pow(0.86, ageDays);
    const progressBoost = idea.progressing ? 12 : 0;
    return Math.round(Math.max(8, Math.min(100, idea.score * decay + (idea.touchCount || 1) * 4 + progressBoost)));
  }

  function shortTrace(analysis, messages) {
    const source = compact(analysis.summary || messages.filter((m) => m.role === "user").map((m) => m.text).join(" "));
    return source.slice(0, 28);
  }

  async function ingest(payload) {
    const state = await getState();
    const messages = payload.messages
      .map((message) => ({ role: message.role || "assistant", text: compact(message.text) }))
      .filter((message) => message.text.length > 2);
    const signature = fingerprint(`${payload.platform}:${payload.url}:${messages.map((m) => m.text).join("|")}`);
    if (state.conversations.some((item) => item.signature === signature)) return { state, duplicate: true };

    const conversation = {
      id: uid("conversation"),
      platform: payload.platform,
      title: compact(payload.title) || `${payload.platform} 对话`,
      url: payload.url,
      messages,
      signature,
      captureQuality: payload.captureQuality || null,
      capturedAt: new Date().toISOString()
    };
    state.conversations.unshift(conversation);

    const analysis = await modelAnalyze({ ...payload, messages }, state.settings);
    let saved = false;
    if (analysis.should_save && analysis.score >= state.settings.minScore) {
      const title = compact(analysis.idea_title) || makeTitle(payload.title, messages.map((m) => m.text).join(" "));
      const existing = state.ideas.find((idea) => similarIdea(idea.title, title));
      const isProgressing = progressSignal(messages) || analysis.progress_signal === true;
      const trace = shortTrace(analysis, messages);
      if (existing) {
        existing.title = existing.title.length <= title.length ? existing.title : title;
        existing.summary = compact(analysis.summary || existing.summary).slice(0, 90);
        existing.score = Math.max(existing.score, analysis.score);
        existing.lastSeenAt = conversation.capturedAt;
        existing.touchCount = (existing.touchCount || 1) + 1;
        existing.progressing = Boolean(existing.progressing || isProgressing);
        existing.sourceIds = Array.from(new Set([...(existing.sourceIds || []), conversation.id]));
        existing.whySaved = Array.from(new Set([...(existing.whySaved || []), ...(analysis.why_saved || [])])).slice(0, 2);
        existing.traces = [{ at: conversation.capturedAt, text: trace }, ...(existing.traces || [])].slice(0, 3);
      } else {
        state.ideas.unshift({
          id: uid("idea"),
          title,
          summary: compact(analysis.summary || "").slice(0, 90),
          type: analysis.idea_type || "other",
          score: analysis.score,
          status: "active",
          progressing: isProgressing,
          firstSeenAt: conversation.capturedAt,
          lastSeenAt: conversation.capturedAt,
          touchCount: 1,
          sourceIds: [conversation.id],
          whySaved: (analysis.why_saved || []).slice(0, 2),
          traces: [{ at: conversation.capturedAt, text: trace }],
          dismissed: false
        });
      }
      saved = true;
    }
    state.ideas.forEach((idea) => { idea.attention = attention(idea); });
    await setState(state);
    return { state, duplicate: false, saved, analysis };
  }

  async function updateIdea(id, patch) {
    const state = await getState();
    const item = state.ideas.find((idea) => idea.id === id);
    if (item) Object.assign(item, patch, { lastSeenAt: patch.lastSeenAt || item.lastSeenAt });
    state.ideas.forEach((idea) => { idea.attention = attention(idea); });
    return setState(state);
  }

  function demoState() {
    const now = new Date().toISOString();
    return {
      ...clone(EMPTY_STATE),
      conversations: [
        { id: "conv_1", platform: "ChatGPT", title: "AI 想法收集器", url: "#", messages: [], capturedAt: now },
        { id: "conv_2", platform: "Gemini", title: "竞品与采集限制", url: "#", messages: [], capturedAt: now }
      ],
      ideas: [
        {
          id: "idea_1",
          title: "AI 对话想法收集器",
          summary: "自动捞出 AI 聊天里的高价值点子。",
          type: "product_idea",
          score: 88,
          attention: 96,
          status: "active",
          progressing: true,
          firstSeenAt: now,
          lastSeenAt: now,
          touchCount: 5,
          sourceIds: ["conv_1", "conv_2"],
          whySaved: ["多次追问可行性", "已进入 MVP 实现"],
          traces: [
            { at: now, text: "跑通网页自动采集" },
            { at: now, text: "接入小模型筛选" },
            { at: now, text: "改成想法球面板" }
          ]
        },
        {
          id: "idea_2",
          title: "想法球注意力面板",
          summary: "用会变化的小球显示近期点子热度。",
          type: "personal_system",
          score: 76,
          attention: 70,
          status: "active",
          progressing: false,
          firstSeenAt: now,
          lastSeenAt: now,
          touchCount: 2,
          sourceIds: ["conv_1"],
          whySaved: ["可视化形态明确", "能体现注意力衰减"],
          traces: [{ at: now, text: "确定轻量文字详情" }]
        }
      ]
    };
  }

  root.AIWorkstream = { getState, setState, ingest, updateIdea, demoState, roughScore, attention };
})(typeof window !== "undefined" ? window : self);
