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

function fallback(payload) {
  const text = (payload.messages || []).map((m) => `${m.role}: ${m.text}`).join("\n");
  const positives = ["我有个想法", "我想做", "能不能做", "怎么落地", "MVP", "产品", "创业", "工具", "插件", "自动化", "用户", "竞品", "验证", "推广"];
  const negatives = ["翻译", "润色", "格式化", "天气", "附近", "笑话"];
  let score = Math.min(30, Math.floor(text.length / 130));
  positives.forEach((word) => { if (text.includes(word)) score += 10; });
  negatives.forEach((word) => { if (text.includes(word)) score -= 18; });
  if (/我.*想法|我想做|我的需求|能不能做/.test(text)) score += 18;
  if (/采集|筛选|可视化|MVP|插件|产品/.test(text)) score += 12;
  score = Math.max(0, Math.min(100, score));
  const shouldSave = score >= 55;
  return {
    should_save: shouldSave,
    idea_title: shouldSave ? String(payload.title || "未命名想法").replace(/[-|].*$/, "").slice(0, 42) : null,
    summary: shouldSave ? text.replace(/\s+/g, " ").slice(0, 220) : null,
    idea_type: "other",
    score,
    why_saved: shouldSave ? ["本地规则判断存在想法探索和后续跟进价值"] : [],
    next_step: shouldSave ? "继续追问：这个想法的最小验证动作是什么？" : null,
    noise_reason: shouldSave ? null : "更像一次性问题或工具请求"
  };
}

function prompt(payload) {
  const transcript = (payload.messages || [])
    .slice(-24)
    .map((m) => `${m.role === "user" ? "用户" : "AI"}：${m.text}`)
    .join("\n\n")
    .slice(0, 16000);
  return `你是一个“想法注意力管理器”的筛选器。

任务：判断下面这段 AI 聊天是否包含值得用户未来继续关注的想法。

保存标准：
- 产品、创业、研究、写作、学习、自动化、投资、工具、个人系统等方向
- 用户表现出个人兴趣、连续探索、可落地意图或未完成问题
- 能提取出一个独立命名的想法
- 有未来跟进价值

不要保存：
- 一次性事实查询
- 翻译、润色、格式化
- 临时生活建议
- 纯娱乐
- 已完成且没有后续价值的请求

只输出 JSON，不要输出解释文字。

JSON 格式：
{
  "should_save": boolean,
  "idea_title": string | null,
  "summary": string | null,
  "idea_type": "product_idea" | "research" | "writing" | "learning" | "automation" | "business" | "personal_system" | "other" | null,
  "score": 0-100,
  "why_saved": string[],
  "next_step": string | null,
  "noise_reason": string | null
}

页面标题：${payload.title || ""}
平台：${payload.platform || ""}

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
