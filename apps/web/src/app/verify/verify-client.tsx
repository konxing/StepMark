"use client";
import {useEffect,useState} from "react";
export default function VerifyClient() {
  const [token,setToken]=useState<string>("");
  const [message,setMessage]=useState("");
  useEffect(()=>{setToken(new URLSearchParams(window.location.search).get("token")??"");},[]);
  async function verify(){
    if(!token){setMessage("缺少有效验证令牌");return;}
    try{
      const r=await fetch("/api/v1/auth/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token})});
      setMessage(r.ok?"账户已验证，可以登录。":"验证失败或链接已失效。");
      if(r.ok) window.history.replaceState(null,"","/verify");
    }catch{setMessage("网络请求失败，请重试。");}
  }
  return <div><button className="primary-link account-button" type="button" onClick={verify}>确认验证</button><p role="status">{message}</p><a href="/login">返回登录</a></div>;
}
