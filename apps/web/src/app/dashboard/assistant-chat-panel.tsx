"use client";
import {useState} from "react";
import WorkEvidencePanel from "./work-evidence-panel";
import {aiErrorMessage} from "@/lib/ai-errors";

type Reply={
  reply:string;
  change:null|{kind:string;habitId:string;habitTitle:string};
  progress:null|{habitId:string;percent:number;repetitions:number;evidenceStale:boolean}
  workEvidenceAdded?:number;
};
type Bubble={id:string;role:"assistant"|"user";text:string};
function localDay(){
  const d=new Date();
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
}
export default function AssistantChatPanel({
  onChanged
}:{onChanged:(habitId:string|null)=>Promise<void>}){
  const [messages,setMessages]=useState<Bubble[]>([
    {id:"welcome",role:"assistant",text:"说说你做了什么、怎么做的、最后怎么样了。你也可以聊习惯或问我下一步怎么验证。"}
  ]);
  const [draft,setDraft]=useState("");
  const [consent,setConsent]=useState(false);
  const [recordEvidence,setRecordEvidence]=useState(true);
  const [evidenceRevision,setEvidenceRevision]=useState(0);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [retry,setRetry]=useState<{message:string;requestId:string}|null>(null);
  async function send(event:React.FormEvent){
    event.preventDefault();
    const message=draft.trim();
    if(busy||message.length<2)return;
    if(!consent){setNotice("请先选择是否同意将当前消息及已有习惯名称发送给配置的第三方 AI 服务商。");return;}
    const sameRetry=retry?.message===message;
    const requestId=sameRetry?retry.requestId:crypto.randomUUID();
    setRetry({message,requestId});
    setBusy(true);setNotice("");setDraft("");
    if(!sameRetry)setMessages(previous=>[...previous,{id:crypto.randomUUID(),
      role:"user" as const,text:message}].slice(-16));
    try {
      const res=await fetch("/api/v1/assistant",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({message,requestId,localDate:localDay(),consentToAI:true,recordGrowthEvidence:recordEvidence})
      });
      const data=await res.json().catch(()=>null) as (Reply&{error?:{code:string}})|null;
      if(!res.ok){
        const code=data?.error?.code;
        throw new Error(aiErrorMessage(code)??(code==="ASSISTANT_NOT_CONFIGURED"?
          "服务器暂未配置对话 AI，仍可通过下方的手动管理记录。":
          code==="RATE_LIMITED"?(function(){
            const raw=res.headers.get("Retry-After")??"";
            const seconds=/^[0-9]{1,5}$/.test(raw)?Number(raw):0;
            return seconds>=1&&seconds<=86400?
              "请求已达到限制，请在约 "+Math.ceil(seconds/60)+" 分钟后重试。":
              "请求已达到限制，请稍后再试。";
          })():
          "本次请求未确认保存，请检查记录后重试，避免重复登记。"));
      }
      if(!data||typeof data.reply!=="string")throw new Error("AI 返回的数据无效，请稍后重试。");
      setRetry(null);
      const reply=data.workEvidenceAdded?`${data.reply}\n已更新 ${data.workEvidenceAdded} 条成长证据。`:data.reply;
      setMessages(previous=>[...previous,{id:crypto.randomUUID(),role:"assistant" as const,text:reply}].slice(-16));
      if(data.workEvidenceAdded)setEvidenceRevision(value=>value+1);
      if(data.change||data.progress){
        try{await onChanged(data.change?.habitId??data.progress?.habitId??null);}
        catch{setNotice("记录已成功处理，但页面统计暂时刷新失败；请重新进入成长进度查看。");}
      }
    }catch(error){
      setDraft(message);
      setNotice(error instanceof Error?error.message:"网络错误，请检查连接。");
    }finally{setBusy(false);}
  }
  return <section className="dashboard-panel assistant-chat" aria-label="StepMark AI 对话">
    <div className="assistant-chat-heading">
      <div><h2>AI 成长助手</h2><p>聊天是主要入口，必要时再使用手动管理。</p></div>
      <span className="assistant-chat-tag">聊天驱动记录</span>
    </div>
    <div className="assistant-messages" role="log" aria-live="polite" aria-label="对话消息">
      {messages.map(item=><p className={"assistant-bubble "+(item.role==="user"?"assistant-bubble-user":"")} key={item.id}>{item.text}</p>)}
    </div>
    <form onSubmit={send} className="assistant-send-form">
      <label htmlFor="assistant-message">向 AI 描述你的行动或提问</label>
      <div className="assistant-compose">
        <textarea id="assistant-message" value={draft} onChange={e=>setDraft(e.target.value)}
          maxLength={600} rows={2} placeholder="说说你做了什么，或有什么实际结果…"/>
        <button type="submit" disabled={busy||draft.trim().length<2}>{busy?"处理中…":"发送"}</button>
      </div>
      <label className="assistant-consent">
        <input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>
        <span>允许将本次对话文字及习惯名称发送给已配置的 AI 服务商。关闭则不发送；当前会话内保留此选择。</span>
      </label>
      {consent&&<label className="assistant-consent">
        <input type="checkbox" checked={recordEvidence} disabled={busy} onChange={e=>setRecordEvidence(e.target.checked)}/>
        <span>从我报告的行动自动保存成长证据（仅保留相关原话）。</span>
      </label>}
      {notice&&<p className="assistant-error" role="status">{notice}</p>}
    </form>
    <WorkEvidencePanel revision={evidenceRevision}/>
  </section>;
}
