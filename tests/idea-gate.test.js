const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadWorkstream() {
  const storage = {};
  const context = {
    console,
    setTimeout,
    clearTimeout,
    self: {},
    localStorage: {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
      },
      setItem(key, value) {
        storage[key] = String(value);
      }
    }
  };
  context.self = context;
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, "..", "extension", "shared.js"), "utf8");
  vm.runInContext(source, context, { filename: "shared.js" });
  return context.AIWorkstream;
}

async function ingest(workstream, messages, captureQuality = { ok: true, mode: "paired" }) {
  return workstream.ingest({
    platform: "ChatGPT",
    title: "Test chat",
    url: `https://chatgpt.com/c/test-${Math.random()}`,
    messages,
    captureQuality
  });
}

(async () => {
  const workstream = loadWorkstream();
  let state = await workstream.getState();
  state.settings.useModelAnalyzer = false;
  await workstream.setState(state);

  const noise = await ingest(workstream, [
    {
      role: "user",
      text: "帮我检查这段页面布局的验收标准，看看还有没有漏掉。"
    },
    {
      role: "assistant",
      text: "验收标准：横版素材全部显示在横版区域；竖版素材全部显示在竖版区域；缺失尺寸信息时不会导致页面报错；搜索功能保持正常；目标是先把问题定义清楚，再让 AI 编码。"
    }
  ]);
  assert.strictEqual(noise.saved, false, "普通代码检查/验收标准不应该变成想法球");

  const idea = await ingest(workstream, [
    {
      role: "user",
      text: "我现在有个想法，做一个自动收集 ChatGPT 和 Gemini 对话里的产品点子，并用小球提醒我继续推进的插件 MVP。"
    },
    {
      role: "assistant",
      text: "可以，下一步需要验证采集权限、筛选标准和最小可用的可视化页面。"
    }
  ]);
  assert.strictEqual(idea.saved, true, "明确的用户自有产品想法应该被保存");

  const historyNoise = await ingest(workstream, [
    {
      role: "user",
      text: "解释一下 Chrome 插件怎么打包。"
    },
    {
      role: "assistant",
      text: "打开 chrome://extensions，点击打包扩展程序，选择扩展根目录。这个流程可以用于插件 MVP、产品测试、用户发布和自动化工作流。"
    }
  ], { ok: true, mode: "history-api" });
  assert.strictEqual(historyNoise.saved, false, "历史回填的一次性教程不应该被保存");

  console.log("idea gate tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
