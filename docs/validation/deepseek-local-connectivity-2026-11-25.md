# DeepSeek 本机连通性验收 · 2026-11-25

本机普通 Windows PowerShell 的真实请求已成功，返回有效 JSON，用时 740 毫秒。结果由用户执行项目脚本后回传；代理、密钥、模型和请求格式在该运行环境下均已通过。

对应代码版本：`4ae842c251d6c2829232cead09a8b77d6fbb1ed6`。

## 实测记录

在项目根目录运行：

```powershell
node --import tsx apps/web/scripts/check-ai.ts
```

用户回传输出：

```text
DeepSeek 连接方式：Windows 系统代理
DeepSeek 实测成功：收到有效回复，用时 740 毫秒。回复通过原请求返回到本机。
```

脚本向 `https://api.deepseek.com/chat/completions` 发送最小 JSON 请求，使用 `deepseek-flash`，关闭思考模式，并验证模型返回的 `ok` 为 `true`。请求使用 `apps/web/.env.local` 中的服务器配置，记录中不包含密钥。

## 调用链核对

- 网页成长助手、实践计划和复盘与诊断脚本共用 `callAiJson` 和代理配置。
- Windows 服务器管理器的「测试 DeepSeek」调用同一个诊断脚本。
- 独立个人客户端通过 Rust 直接调用官方接口，已启用 Windows 系统代理支持。客户端密钥保存在本机凭据管理器中，需在客户端单独配置。
- DeepSeek 回复沿原 HTTPS 请求返回，无需 `stepmark.xin` 回调。

ChatGPT 执行环境内的测试仍在连接阶段返回 `AI_NETWORK_BLOCKED`，且该环境内的外部域名解析失败。该结果与普通 PowerShell 中的成功结果应分别记录，不能据此判定本机软件的 DeepSeek 服务不可用。

## 验收范围

本次确认官方接口连通及最小 JSON 回复有效。740 毫秒是单次观测，不代表延迟保证。本次未验收网页完整登录流程、独立个人客户端的实际对话、20 条样例的真实模型量化对照或能力评分有效性；对应检查需独立记录，不能用连通测试代替。
