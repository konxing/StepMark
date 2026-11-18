# stepmark.xin 域名部署与 Windows 预览验收

状态：域名已由项目负责人确认购买；**不表示已完成 DNS、TLS 或生产服务部署**。
唯一规范 origin：**https://stepmark.xin**。桌面包在编译时固定该地址。

## 域名与服务器（由拥有 DNS 和主机权限的操作者执行）

1. 在域名注册商管理界面，将 stepmark.xin 的 A/AAAA 或托管服务要求的
   DNS 记录指向**实际受控**的 Web 入口。不要复制示例 IP；未知时先确定
   部署提供商和其 DNS 指令。检查 CAA、DNSSEC 与证书策略。
2. 配置 TLS 证书覆盖 stepmark.xin，自动续期，强制 HTTP→HTTPS；
   只有在真实 HTTPS 全面可用后才考虑启用 HSTS。避免将 www 与根域
   混用：如果启用 www，统一 301/308 重定向到 https://stepmark.xin。
3. 将 HTTPS /、/login、/api/v1/* 代理到同一 Next.js 应用；
   不要将 /api/v1 交给静态站点、CDN HTML fallback 或另一套旧服务。
   反向代理正确处理 Host、X-Forwarded-Proto、请求体大小、超时；
   仅信任由受控入口覆写的客户端 IP 请求头。
4. 在**服务器私有环境**配置 APP_ORIGIN=https://stepmark.xin、
   DATABASE_URL、强随机 RATE_LIMIT_SECRET 及必要的邮件发送配置；
   依既有数据库迁移手册备份、迁移、健康检查。不要把凭据写入 GitHub
   workflow、网页 JS、小程序包或 Windows 安装包。
5. 若微信小程序也使用该域名：在微信小程序管理后台登记合法 HTTPS
   request 域名，再设置其公开 apiBase；上线前必须做微信真机验证。
   微信账号与邮箱账号目前不自动合并。

## 可复验的上线检查

- 在可联网环境运行 node apps/desktop/scripts/check-deployment.mjs。
  只读探测 DNS、有效 HTTPS 证书、GET /api/v1/me 与
  GET /api/v1/habits 未授权时均返回 401 JSON；不传用户凭据。
  失败代表公网 API 未准备好；通过也**不等于**端到端登录验证。
- GitHub Actions 的 Windows Desktop 工作流在 main push 自动编译
  Windows NSIS **未签名**预览包并上传短期 artifact；下载前检查
  工作流 commit SHA 和构建日志，不能把 artifact 当正式发行签名。
- 可信 Windows 测试机上执行：下载并校验来源、安装/卸载、WebView2
  启动、系统浏览器授权、回环端口回调、习惯列表只读、退出/重新登录、
  断网/证书失败、会话撤销和另一账号隔离。检查 Windows Credential
  Manager 无明文文件备份，注销后本机凭据消失。
- 发布门禁：通过以上真机 E2E、代码签名/SmartScreen、备份恢复与
  数据保护审查；否则保持“预览测试”状态，不发布为正式稳定版。

## 回滚

桌面包不能直接写入或修改现有业务数据。若线上域名尚未就绪，不要发给
普通用户。若发生问题，停止分发新包、回滚服务端应用至兼容版本，
但保留数据库迁移与备份纪律；不要为回滚清空用户表或泄露私有题库。
