# AI Workstream MVP

桌面浏览器扩展 MVP：自动采集 ChatGPT、Gemini、Claude 网页里的对话，筛选出值得未来继续关注的想法，并用“想法球”展示注意力热度。

## 当前能力

- ChatGPT 页面会自动分析当前打开的对话。
- ChatGPT 页面加载后会自动补扫最近 20 条历史会话。
- 自动补扫默认每 10 分钟执行一次，并带跨标签页锁，避免重复扫描。
- 小模型可用时走硅基流动筛选；不可用时退回本地规则。
- 本地只保存想法摘要、分数、判断理由、下一步提示和来源数量。
- 数据保存在 `chrome.storage.local`。

## 安装扩展

1. 打开 `chrome://extensions`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择 `C:\Users\adam\Documents\Codex\AIWorkstreamMVP\extension`。
5. 每次同步更新后，在扩展页点击 AI Workstream 的刷新按钮。

## 启动分析服务

没有 API key 时也能跑，但会退回本地规则。

```powershell
.\start-analyzer.ps1
```

本机 `.env` 支持：

```text
SILICONFLOW_API_KEY=你的 key
SILICONFLOW_MODEL=deepseek-ai/DeepSeek-V4-Flash
```

扩展调用：

```text
http://127.0.0.1:8787/analyze
```

健康检查：

```text
http://127.0.0.1:8787/health
```

## 仍然不解决

- 不能采集手机官方 App。
- 浏览器完全关闭、标签页关闭、页面休眠时不能继续采集。
- ChatGPT/Gemini 改页面结构时，选择器可能需要维护。
- 当前只做本地 MVP，不做云同步和跨设备推送。
