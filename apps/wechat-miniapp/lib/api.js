/**
 * WeChat-specific transport adapter. Page components must not implement their
 * own authentication headers, provider URLs or error parsing.
 * No backend credentials or AI API keys belong in the mini-program bundle.
 */
function requestApi({apiBase,path,method="GET",data,accessToken,authenticated=true}){
  if(typeof apiBase!=="string"||
     !/^https:\/\/[a-z0-9.-]+(?::443)?$/i.test(apiBase)||
     apiBase.includes("..")||apiBase.includes("--")){
    return Promise.reject(new Error("请先配置已注册的 HTTPS API 域名"));
  }
  if(typeof path!=="string"||!path.startsWith("/api/v1/")||
     path.startsWith("//")||path.includes("#")||path.includes("\\")||
     /(?:^|\/)\.\.?\//.test(path)||/%2e|%2f|%5c/i.test(path)||
     !/^(GET|POST|PUT|DELETE)$/.test(method)){
    return Promise.reject(new Error("不支持的 API 请求"));
  }
  if(authenticated&&(!accessToken||typeof accessToken!=="string")){
    return Promise.reject(new Error("登录信息已过期"));
  }
  return new Promise((resolve,reject)=>{
    wx.request({
      url:apiBase+path,method,
      header:Object.assign({"content-type":"application/json"},
        authenticated?{"Authorization":"Bearer "+accessToken}:{}),
      data,timeout:path==="/api/v1/assistant"?17000:8000,
      success:res=>{
        if(res.statusCode>=200&&res.statusCode<300){resolve(res.data);return;}
        const code=res.data&&res.data.error&&res.data.error.code;
        const error=new Error(res.statusCode===401?"登录信息已过期":
          code==="ASSISTANT_NOT_CONFIGURED"?"服务器暂未配置对话 AI，可先使用手动管理。":
          code==="RATE_LIMITED"?"AI 对话次数达到上限，请稍后使用。":
          "服务请求失败（"+res.statusCode+"）");
        error.code=code;reject(error);
      },
      fail:()=>reject(new Error("网络请求失败"))
    });
  });
}
module.exports={requestApi};
