"use client";
import {useEffect,useState} from "react";
export default function RecoveryForm({mode}:{mode:"forgot"|"reset"}){
  const [email,setEmail]=useState(""),[token,setToken]=useState(""),[password,setPassword]=useState("");
  const [message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{if(mode==="reset")setToken(new URLSearchParams(location.search).get("token")??"");},[mode]);
  async function submit(e:React.FormEvent){
    e.preventDefault();if(busy)return;setBusy(true);setMessage("");
    try{
      const res=await fetch(mode==="forgot"?"/api/v1/auth/forgot-password":"/api/v1/auth/reset-password",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(mode==="forgot"?{email}:{token,newPassword:password})
      });
      setMessage(res.ok?(mode==="forgot"?"如果账户存在且已验证，你将收到密码重置邮件。":"密码已修改；所有旧会话已经失效。"):"操作失败或链接已失效。");
      if(res.ok&&mode==="reset")history.replaceState(null,"","/reset-password");
    }catch{setMessage("网络请求失败。");}finally{setBusy(false);}
  }
  return <main className="account-shell"><a className="wordmark" href="/">STEP<span>MARK</span><span className="brand-dot">.</span></a>
    <h1>{mode==="forgot"?"找回账户密码":"设置新密码"}</h1>
    <form className="account-form" onSubmit={submit}>
      {mode==="forgot"?<><label htmlFor="recovery-email">邮箱</label><input id="recovery-email" type="email" maxLength={254} required value={email} onChange={e=>setEmail(e.target.value)}/></>:<>
        <label htmlFor="new-password">新密码（至少 12 个字符）</label><input id="new-password" type="password" minLength={12} maxLength={128} required autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/>
      </>}
      <button disabled={busy}>{busy?"提交中…":"提交"}</button><p role="status">{message}</p>
    </form><a href="/login">返回登录</a>
  </main>;
}
