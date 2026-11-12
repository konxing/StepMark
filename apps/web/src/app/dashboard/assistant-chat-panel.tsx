"use client";
import {useState} from "react";

type Reply={
  reply:string;
  change:null|{kind:string;habitId:string;habitTitle:string};
  progress:null|{habitId:string;percent:number;repetitions:number;evidenceStale:boolean}
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
    {id:"welcome",role:"assistant",text:"你可以直接告诉我：想建立什么习惯、今天是否执行、开始行动时有什么感受，或想查看哪项习惯的进度。明确的记录会由服务器安全保存。"}
  ]);
  const [draft,setDraft]=useState("");
  const [consent,setConsent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  async function send(event:React.FormEvent){
    event.preventDefault();
    const message=draft.trim();
    if(busy||message.length<2)return;
    if(!consent){setNotice("请先选择是否同意将当前消息及已有习惯名称发送给配置的第三方 AI 服务商。");return;}
    setBusy(true);setNotice("");setDraft("");
    setMessages(previous=>[...previous,{id:crypto.randomUUID(),role:"user" as const,text:message}].slice(-16));
    try {
      const res=await fetch("/api/v1/assistant",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({message,requestId:crypto.randomUUID(),localDate:localDay(),consentToAI:true})
      });
      const data=await res.json().catch(()=>null) as (Reply&{error?:{code:string}})|null;
      if(!res.ok){
        const code=data?.error?.code;
        throw new Error(code==="ASSISTANT_NOT_CONFIGURED"?
          "服务器暂未配置对话 AI，仍可通过下方的手动管理记录。":
          code==="RATE_LIMITED"?"对话次数已达到限制，请稍后再试。":
          "本次请求未确认保存，请检查记录后重试，避免重复登记。");
      }
      if(!data||typeof data.reply!=="string")throw new Error("AI 返回的数据无效，请稍后重试。");
      setMessages(previous=>[...previous,{id:crypto.randomUUID(),role:"assistant" as const,text:data.reply}].slice(-16));
      if(data.change||data.progress)await onChanged(data.change?.habitId??data.progress?.habitId??null);
    }catch(error){
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
    <div className="assistant-suggestions">
      {["帮我添加一个睡前阅读10页的习惯","我今天完成了睡前阅读","查看睡前阅读的习惯进度"].map(x=>
        <button key={x} type="button" disabled={busy} onClick={()=>setDraft(x)}>{x}</button>)}
    </div>
    <form onSubmit={send} className="assistant-send-form">
      <label htmlFor="assistant-message">向 AI 描述你的行动或提问</label>
      <div className="assistant-compose">
        <textarea id="assistant-message" value={draft} onChange={e=>setDraft(e.target.value)}
          maxLength={600} rows={2} placeholder="例如：今天做了睡前阅读，开始时一点也没纠结…"/>
        <button type="submit" disabled={busy||draft.trim().length<2}>{busy?"处理中…":"发送"}</button>
      </div>
      <label className="assistant-consent">
        <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
        <span>允许将本次对话文字及习惯名称发送给已配置的 AI 服务商。关闭则不发送；当前会话内保留此选择。</span>
      </label>
      <p className="assistant-chat-help">AI 只能建议受控操作；服务器校验身份、原话和目标习惯后才会写入。聊天记录暂时只显示在本页，不会自动保存为长期聊天历史。</p>
      {notice&&<p className="assistant-error" role="status">{notice}</p>}
    </form>
  </section>;
}
