const config = require("./config");
App({
  globalData: { apiBase: config.apiBase },
  onLaunch() {
    // Sensitive WeChat session codes and AppSecret must NEVER enter logs
    // or this client bundle. Only the server exchanges wx.login codes.
  }
});
