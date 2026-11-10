"use client";
import {useState} from "react";
type Mode="login"|"register";
export default function AccountForm({mode}:{mode:Mode}) {
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();if(loading)return;setLoading(true);setMessage("");
    try {
      const response=await fetch(`/api/v1/auth/${mode}`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({email,password}),credentials:"same-origin"
      });
      if(response.ok && mode==="login"){location.assign("/dashboard");return;}
      if(response.ok){setMessage("若可以注册，你将收到一封验证邮件。请验证后登录。");}
      else {setMessage(response.status===429?"请求太频繁，请稍后再试。":response.status===503?"登录服务尚未配置完成。":"操作失败，请核对信息或完成邮箱验证。");}
    }catch {setMessage("网络错误，请稍后再试。");} finally {setLoading(false);}
  }
  return <main className="account-shell">
    <a className="wordmark" href="/">STEP<span>MARK</span><span className="brand-dot">.</span></a>
    <h1>{mode==="login"?"欢迎回来":"创建账户"}</h1>
    <p>你的能力证据、习惯和成长记录仅属于你的账户。</p>
    <form onSubmit={submit} className="account-form">
      <label htmlFor="email">邮箱</label>
      <input id="email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={e=>setEmail(e.target.value)}/>
      <label htmlFor="password">密码</label>
      <input id="password" type="password" autoComplete={mode==="register"?"new-password":"current-password"}
        minLength={mode==="register"?12:1} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)}/>
      {mode==="register"&&<small>至少 12 个字符。注册需要先验证邮箱。</small>}
      <button type="submit" disabled={loading}>{loading?"提交中…":mode==="register"?"注册":"登录"}</button>
      <p role="status" aria-live="polite">{message}</p>
    </form>
    {mode==="login"&&<p><a href="/forgot-password">忘记密码？</a></p>}
    <p>{mode==="register"?<>已有账户？<a href="/login">登录</a></>:<>没有账户？<a href="/register">注册</a></>}</p>
  </main>;
}
