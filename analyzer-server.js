const http = require("http");

const PORT = Number(process.env.PORT || 8787);
const API_KEY = process.env.SILICONFLOW_API_KEY || "";
const MODEL = process.env.SILICONFLOW_MODEL || "Qwen/Qwen2.5-7B-Instruct";

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS"
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 500000) reject(new Error("Payload too large"));
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function compact(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function userOwnedSignal(userText) {
  return /我(现在)?有个想法|我想做|我在想|我的需求|我希望|我打算|能不能做(一个|个)?|可不可以做|这个产品|这个工具|这个应用|这个软件|这个插件/.test(userText);
}

function actionableSignal(text) {
  return /MVP|原型|验证|落地|推进|下一步|持续|跟进|提醒|自动|采集|筛选|可视化|项目|产品|插件|工具|app|应用|用户|市场|竞品|商业|写作计划|研究计划|学习计划|个人系统/.test(text);
}

function noiseSignal(userText, allText) {
  return /^(帮我)?(翻译|润色|改写|解释|总结|检查|优化|修复|生成|写一段|列一下)/.test(userText)
    || /验收标准|报错|语法错误|安装包|怎么安装|在哪里打开|打包扩展程序|命令行|截图|帮我看看这段|解释一下|这是什么意思/.test(userText)
    || /天气|汇率|附近|路线|菜谱|笑话|翻译|润色|格式化/.test(allText);
}

function fallback(payload) {
  const messages = payload.messages || [];
  const text = compact(messages.map((m) => `${m.role}: ${m.text}`).join("\n"));
  const userText = compact(messages.filter((m) => m.role === "user").map((m) => m.text).join(" "));
  const owned = userOwnedSignal(userText);
  const actionable = actionableSignal(text);
  const noisy = noiseSignal(userText, text);

  let score = 20;
  if (owned) score += 35;
  if (actionable) score += 25;
  if (/还没解决|阻塞|风险|方案|架构|需要验证|值得跟进|长期|持续/.test(text)) score += 10;
  if (messages.filter((m) => m.role === "user").length >= 3) score += 6;
  score += Math.min(8, Math.floor(text.length / 600));
  if (!userText || noisy) score = Math.min(40, Math.floor(text.length / 240));
  score = Math.max(0, Math.min(100, score));

  const shouldSave = owned && actionable && !noisy && score >= 78;
  return {
    should_save: shouldSave,
    idea_title: shouldSave ? String(payload.title || userText || "未命名想法").replace(/[-|].*$/, "").slice(0, 42) : null,
    summary: shouldSave ? userText.slice(0, 120) : null,
    idea_type: actionable ? "product_idea" : "other",
    score,
    is_user_owned_idea: owned,
    is_actionable: actionable,
    is_noise: noisy,
    noise_type: noisy ? "one_off_or_tooling" : null,
    why_saved: shouldSave ? ["用户明确提出自己的点子", "有后续推进或验证价值"] : [],
    next_step: shouldSave ? "继续追问：这个想法的最小验证动作是什么？" : null,
    noise_reason: shouldSave ? null : "缺少用户自有点子、后续推进价值，或更像一次性工具请求"
  };
}

function prompt(payload) {
  const transcript = (payload.messages || [])
    .slice(-24)
    .map((m) => `${m.role === "user" ? "用户" : "AI"}：${m.text}`)
    .join("\n\n")
    .slice(0, 16000);

  return `你是一个“想法注意力管理器”的严格筛选器。
你的默认策略是宁可漏掉弱想法，也不要把普通问答污染成想法球。

任务：判断下面这段 AI 聊天是否包含“用户自己的、未来值得继续推进的想法”。

必须全部满足才保存：
1. 用户本人提出了一个想法、产品、工具、研究、写作、学习计划、自动化方案、个人系统或商业假设。
2. 这个想法还没有结束，有未来跟进、验证、推进、提醒或决策价值。
3. 能提取一个独立、短小、可命名的想法标题。
4. 主要价值来自用户意图，不是 AI 的泛泛建议。

必须拒绝：
1. 一次性教程、事实查询、代码报错、安装步骤、网页操作说明。
2. 翻译、润色、格式化、总结、解释概念、检查验收标准。
3. 只有 AI 回答很长，但用户没有表达自己的项目/想法。
4. 普通聊天里出现“产品、MVP、插件、用户”等关键词，但本质是在问怎么操作。
5. 已完成且没有后续价值的请求。

打分规则：
- 90-100：明确自有项目/想法，且正在推进或多次跟进。
- 78-89：明确自有想法，有下一步价值。
- 50-77：有相关主题，但更像普通咨询或还不够成形，should_save 必须为 false。
- 0-49：噪音或一次性请求，should_save 必须为 false。

只输出 JSON，不要输出解释文字。
JSON 格式：
{
  "should_save": boolean,
  "idea_title": string | null,
  "summary": string | null,
  "idea_type": "product_idea" | "research" | "writing" | "learning" | "automation" | "business" | "personal_system" | "other" | null,
  "score": 0-100,
  "is_user_owned_idea": boolean,
  "is_actionable": boolean,
  "is_noise": boolean,
  "noise_type": "one_off_or_tooling" | "assistant_only" | "translation_or_formatting" | "fact_lookup" | "finished_request" | null,
  "why_saved": string[],
  "next_step": string | null,
  "noise_reason": string | null
}

页面标题：${payload.title || ""}
平台：${payload.platform || ""}
采集模式：${payload.captureQuality?.mode || ""}

聊天内容：
${transcript}`;
}

async function callSiliconFlow(payload) {
  if (!API_KEY) return fallback(payload);
  const response = await fetch("https://api.siliconflow.cn/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt(payload) }]
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.message || `SiliconFlow ${response.status}`);
  const content = data.choices?.[0]?.message?.content || "{}";
  return JSON.parse(content);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 200, {});
  if (req.url === "/health") return json(res, 200, { ok: true, model: MODEL, hasKey: Boolean(API_KEY) });
  if (req.method !== "POST" || req.url !== "/analyze") return json(res, 404, { error: "Not found" });
  try {
    const payload = JSON.parse(await readBody(req));
    const result = await callSiliconFlow(payload);
    json(res, 200, result);
  } catch (error) {
    json(res, 500, { error: error.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`AI Workstream analyzer listening on http://127.0.0.1:${PORT}`);
  console.log(API_KEY ? `Using SiliconFlow model: ${MODEL}` : "No SILICONFLOW_API_KEY set; using local fallback.");
});
