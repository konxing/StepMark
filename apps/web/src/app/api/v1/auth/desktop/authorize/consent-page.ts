const htmlEntities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => htmlEntities[character] ?? character);
}

export function renderDesktopConsentPage(authorizationPath: string, email: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>授权 StepMark Windows</title>
    <style>
      body {
        font-family: system-ui, "Microsoft YaHei", sans-serif;
        background: #f5f6f2;
        color: #173a2c;
        margin: 0;
        padding: 8vh 18px;
      }

      main {
        max-width: 500px;
        margin: auto;
        background: white;
        border: 1px solid #dae5da;
        border-radius: 16px;
        padding: 32px;
      }

      p {
        line-height: 1.8;
        color: #526b5a;
      }

      button {
        background: #173a2c;
        color: white;
        border: 0;
        border-radius: 8px;
        padding: 14px 24px;
        cursor: pointer;
      }

      small {
        color: #65776b;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>连接 Windows 桌面端</h1>
      <p>当前账号：${escapeHtml(email)}</p>
      <p>确认后，StepMark Windows 可以<strong>只读查看</strong>你的账号、习惯进度和关联的测评表现。请确认是你本人启动的桌面登录。</p>
      <form method="post" action="${escapeHtml(authorizationPath)}">
        <button type="submit">确认连接</button>
      </form>
      <p><small>授权码仅可使用一次，约 2 分钟后失效。你可随时在桌面端注销。</small></p>
    </main>
  </body>
</html>`;
}
