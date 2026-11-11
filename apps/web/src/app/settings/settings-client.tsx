"use client";
import {useState} from "react";
const types=["habits","events","corrections","reflections","automaticity","assessments","practice","estimates","judgements"] as const;
export default function SettingsClient({email}:{email:string}){
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [password,setPassword]=useState(""),[confirmation,setConfirmation]=useState("");
  async function exportData(){
    if(busy)return;setBusy(true);setMessage("正在准备数据导出…");
    try{
      const data:Record<string,unknown[]>={};
      for(const type of types){
        let offset:number|null=0;
        const all:unknown[]=[];
        for(let pages=0;offset!==null&&pages<200;pages++){
          const response=await fetch(`/api/v1/account/export?kind=${type}&offset=${offset}`,{cache:"no-store"});
          if(!response.ok)throw new Error("导出失败");
          const chunk=await response.json() as {items:unknown[];nextOffset:number|null};
          all.push(...chunk.items);offset=chunk.nextOffset;
        }
        if(offset!==null)throw new Error("数据过大，请分批导出");
        data[type]=all;
      }
      const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),data},null,2)],{type:"application/json"});
      const objectURL=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=objectURL;a.download="stepmark-my-data.json";a.click();
      setTimeout(()=>URL.revokeObjectURL(objectURL),1000);
      setMessage("数据已准备为 JSON 文件，请妥善保管。");
    }catch(e){setMessage(e instanceof Error?e.message:"导出失败");}
    finally{setBusy(false);}
  }
  async function deleteAccount(e:React.FormEvent){
    e.preventDefault();if(busy||confirmation!=="DELETE")return;
    if(!confirm("删除账户将永久清除本账户的习惯、能力记录及会话。确定继续吗？"))return;
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/v1/account/delete",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({password,confirmation})});
      if(!response.ok){setMessage("删除失败，请核对密码。");return;}
      location.assign("/");
    }catch{setMessage("网络错误，请稍后再试。");}finally{setBusy(false);}
  }
  return <main className="account-shell">
    <a className="wordmark" href="/">STEP<span>MARK</span><span className="brand-dot">.</span></a>
    <div className="assess-top"><a href="/dashboard">← 返回控制台</a></div>
    <h1>账户与数据</h1><p>当前邮箱：{email}</p>
    <h2>导出个人数据</h2>
    <p>可导出你的习惯、执行记录及其全部更正历史、试验性测量和评分证据。文件可能含有私人信息，不会上传到第三方。</p>
    <button className="assess-button" disabled={busy} onClick={exportData}>导出 JSON 数据</button>
    <hr className="settings-divider"/>
    <h2>删除账户</h2>
    <p>此操作不可撤销。请重新输入密码，并输入大写 DELETE。微信账户删除需另行完成微信身份重新验证。</p>
    <form className="account-form" onSubmit={deleteAccount}>
      <label htmlFor="delete-password">当前密码</label>
      <input id="delete-password" type="password" required maxLength={128} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/>
      <label htmlFor="delete-confirm">确认文本</label>
      <input id="delete-confirm" required maxLength={6} value={confirmation} onChange={e=>setConfirmation(e.target.value)} placeholder="DELETE"/>
      <button disabled={busy||confirmation!=="DELETE"||!password} className="danger-action">永久删除账户</button>
    </form>
    <p role="status">{message}</p>
  </main>;
}
