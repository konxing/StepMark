export const aiErrorMessages:Readonly<Record<string,string>>=Object.freeze({
  AI_AUTHENTICATION_FAILED:"AI 服务拒绝了密钥，请在服务器或连接设置中检查密钥和权限。",
  AI_INSUFFICIENT_BALANCE:"AI 服务账户余额不足，请检查服务商账户。",
  AI_RATE_LIMITED:"AI 服务当前请求较多，请稍后重试。",
  AI_MODEL_UNAVAILABLE:"AI 服务拒绝了当前模型或请求，请检查模型配置。",
  AI_DNS_FAILED:"无法解析 AI 服务地址，请检查运行 StepMark 的电脑的 DNS 和代理。",
  AI_CONNECTION_REFUSED:"AI 服务或代理拒绝了连接，请检查代理是否运行及端口是否正确。",
  AI_NETWORK_BLOCKED:"当前运行环境禁止了 AI 网络连接，请检查运行环境的网络权限。",
  AI_TLS_FAILED:"AI 连接的证书验证失败，请检查电脑时间和代理证书。",
  AI_TIMEOUT:"AI 回复超时，请稍后重试。",
  AI_CONNECTION_FAILED:"无法连接 AI 服务，请检查运行 StepMark 的电脑的网络和代理。",
  AI_PROXY_INVALID:"服务器代理地址无效，请检查 HTTPS_PROXY 或 Windows 代理设置。",
  AI_PROXY_RUNTIME_UNSUPPORTED:"此 Node.js 版本无法自动使用代理，请安装 Node.js 24.14 或更新版本后重启 StepMark。",
  AI_UPSTREAM_FAILED:"AI 服务暂时不可用，请稍后重试。",
  AI_RESPONSE_TOO_LARGE:"AI 回复超出长度限制，请缩短问题后重试。",
  AI_RESPONSE_INVALID:"AI 没有返回可用内容，请重试。",
  AI_RESPONSE_INVALID_JSON:"AI 回复格式不正确，请重试。",
  AI_RESPONSE_INCOMPLETE:"AI 没有完整返回结果，请缩短问题后重试。"
});

export function aiErrorMessage(code:string|undefined):string|undefined{
  return code&&Object.hasOwn(aiErrorMessages,code)?aiErrorMessages[code]:undefined;
}
