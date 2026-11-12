# StepMark 手机适配与 AI 对话显示验收

## 已在代码中实现的兼容措施

- 小程序首页优先显示聊天入口，将手动表单和训练入口折叠到“展开手动管理与专项训练”。习惯列表保留只读入口，用户仍可以查阅统计和历史。
- 聊天记录为独立纵向滚动区域，输入框使用可增长但限定高度的 textarea，长文本允许换行，操作按钮有最小触摸高度；页面使用 rpx 及安全区底部留白。
- 运行中的 API 请求通过 `chatBusy` 防止重复点击；发生网络超时后复用相同的消息请求 ID，服务端拥有数据库唯一操作回执。
- 当前进度和近期感受来源于已有用户隔离的 API，数据改变后主动刷新，不能让前端自行计算习惯/能力分数。
- 重要：小程序 `wx.request` 合法请求方法没有 PATCH，复查开关沿用 PUT；新的对话入口使用 POST。
- Web 使用响应式两列→单列布局，聊天提示消息为受限滚动区域，窄屏按钮和输入框不应撑开容器。

## 可自动检查的内容

`node --test apps/wechat-miniapp/scripts/verify-layout.test.mjs`：检查 WXML 结构闭合、关键数据绑定、聊天事件、窄屏布局约束、安全区以及不依赖 PATCH 的移动网络调用；CI 同时执行小程序 JS 语法检查、Next.js 生产构建、真实 PostgreSQL 多用户 API 测试。

**这些检查不是屏幕截图或真实微信内核的渲染结果。** 缺乏真机证据时，不应声称已经在微信 iOS、Android 上全部显示正常。

## 必须做的实际验收（发布前）

在真实微信开发者工具和手机分别检查宽度 320 / 375 / 430 CSS 像素、iPhone 安全区、常见 Android、微信字体放大 1.3–1.5x、键盘弹起/收起、返回前台、网络弱网或重复点击。

重点核对：
1. 聊天滚动区可以看到最后一条回复，输入框在软键盘弹起时仍可操作，不会被底部手势区域遮挡。
2. 用户长文本和 AI 长回复不会引起水平滚动；“发送”及“展开手动管理”点击区域不相互覆盖。
3. 多习惯账户能正确判定消息目标，错误或模糊意图只返回澄清，不会修改其他习惯。
4. 打卡后列表数、进度图、感受反馈、维护提醒在同一账户网页和小程序里一致；日期边界在 UTC+8 23:55 与次日 00:05 需单独测试。
5. 关闭 AI 转发授权时不能发送请求，服务器未配置 AI 时明确提示，不得显示虚构回复。
6. 发布版必须为已认证合法域名的 HTTPS API，并在微信公众平台配置 request 合法域名。正式上传前须替换 `touristappid` 并检查登录和授权流程。
7. 性能：在弱网下检查对话入口反馈时间、列表加载时长、超时重试、一百个习惯情况下的界面滚动。实时 AI 需依赖外部模型响应，不能将本地快速接口的延迟等同于 AI 响应延迟。

## 剩余风险

微信真机渲染与无障碍、商用 API 服务商数据处理条款、服务端公网压测、聊天长期上下文/历史管理、实际模型回答质量尚需独立验收。当前的 AI 对话是 **单轮受控命令**，不是开放式全权限智能体；未配置模型和用户同意时不应称其已经可使用。

## Critical account synchronization caveat

The current mini-program uses WeChat OpenID identity while the website uses email login. Until an explicit, secure account-linking flow is built, the same human may have **different** StepMark user IDs in the two clients. A mismatch in visible habits across those accounts is therefore expected, not something to fix by disabling user isolation. See `ACCOUNT_LINKING_PLAN.md` for the required threat model and acceptance criteria.

For display checking today, compare API results **only within the same authenticated canonical user** (for example, via direct controlled test sessions in CI), not two independently created identities.
