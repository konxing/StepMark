"use client";
import {useCallback,useEffect,useState} from "react";
type Progress={progress:number;repetitionSignal:number;automaticitySignal:number|null;
  completedRepetitions:number;evidenceCount:number;reviewDue:boolean;nextReviewAt:string|null;
  stage:string;policyVersion:string;reviewEnabled:boolean;reviewReason:string};
type Reflection = {id:string;eventId:string|null;note:string|null;initiationLevel:number|null;
  aiConsent:boolean;aiStatus:string;aiLevel:number|null;aiQuote:string|null;createdAt:string};
const options=[
  ["0","非常抗拒"],["1","需要逼自己"],["2","有一点纠结"],
  ["3","比较自然"],["4","几乎不用思考"]
] as const;
export default function HabitGrowthPanel({habitId,eventId}:{habitId:string;eventId?:string|null}) {
  const [result,setResult]=useState<Progress|null>(null);
  const [history,setHistory]=useState<Reflection[]>([]);
  const [level,setLevel]=useState<string>("");
  const [note,setNote]=useState("");
  const [linkedEventId,setLinkedEventId]=useState(eventId??null);
  const [consent,setConsent]=useState(false);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  async function toggleReview(){
    if(!result||busy)return;
    setBusy(true);
    try{
      const response=await fetch("/api/v1/habits/"+habitId+"/reviews",{
        method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({enabled:!result.reviewEnabled})
      });
      if(!response.ok)throw new Error();
      await load();
      setMessage(result.reviewEnabled?"应用内复查提示已关闭。":"应用内复查提示已开启。");
    }catch{setMessage("复查设置修改失败。");}finally{setBusy(false);}
  }
  const load=useCallback(async()=>{
    const [progressResponse,historyResponse]=await Promise.all([
      fetch("/api/v1/habits/"+habitId+"/progress",{cache:"no-store"}),
      fetch("/api/v1/habits/"+habitId+"/reflections",{cache:"no-store"})
    ]);
    if(!progressResponse.ok||!historyResponse.ok)throw new Error("NO_PROGRESS");
    const [progressData,historyData]=await Promise.all([
      progressResponse.json() as Promise<Progress>,
      historyResponse.json() as Promise<{reflections:Reflection[]}>
    ]);
    setResult(progressData);setHistory(historyData.reflections.slice(0,6));
  },[habitId]);
  useEffect(()=>{setLinkedEventId(eventId??null);void load().catch(()=>setMessage("进度暂时无法读取。"));},[load,eventId]);
  async function save(){
    if(busy||(!note.trim()&&!level))return;
    setBusy(true);setMessage("");
    try{
      const payload:Record<string,unknown>={aiConsent:consent};
      if(note.trim())payload.note=note.trim();
      if(level)payload.initiationLevel=Number(level);
      if(linkedEventId)payload.eventId=linkedEventId;
      const res=await fetch("/api/v1/habits/"+habitId+"/reflections",{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)
      });
      if(!res.ok)throw new Error(res.status===409?"这次感受已经保存。":"感受保存失败。");
      const response=await res.json() as {reflection:{aiStatus:string}};
      setLevel("");setNote("");setConsent(false);setLinkedEventId(null);
      await load();
      setMessage(response.reflection.aiStatus==="PENDING"?
        "已保存感受。AI 将由服务端任务异步分析；自评立即参与进度计算。":
        "感受已保存；未向外部 AI 发送文字。");
    }catch(error){setMessage(error instanceof Error?error.message:"保存失败");}
    finally{setBusy(false);}
  }
  async function modifyReflection(reflection:Reflection,action:"revoke"|"delete"){
    if(busy)return;
    if(action==="delete"&&!confirm("彻底删除这条感受和 StepMark 中保存的 AI 结果？此操作不可撤销。"))return;
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/v1/habits/"+habitId+"/reflections/"+reflection.id,{
        method:action==="delete"?"DELETE":"PATCH"
      });
      if(!response.ok){
        setMessage(response.status===409?
          "AI 正在处理该记录，可能已向供应商发送文字；此刻无法保证取消，请稍后重试。":
          "操作失败，请稍后重试。");
        return;
      }
      const data=await response.json() as {mayHaveBeenSentToProvider:boolean};
      await load();
      setMessage(data.mayHaveBeenSentToProvider?
        "已更新 StepMark 内的数据和后续授权，但以前发送给服务商的文字不能被撤回。":
        action==="delete"?"已删除这条感受及相关的本地分析。":"已撤回 AI 授权，保留你的原始自评。");
    }catch{setMessage("网络错误，未能完成操作。");}finally{setBusy(false);}
  }
  return <section className="dashboard-panel" aria-label="习惯进度和维护">
    <h2>习惯成长进度</h2>
    {result ? <>
      <div className="progress-head"><strong>{result.progress.toFixed(1)}%</strong>
        <span>{result.reviewDue?"建议复查":result.stage==="maintaining"?"较稳定·维护观察":result.stage==="developing"?"形成中":"收集证据"}</span>
      </div>
      <div className="growth-track" role="progressbar" aria-label="实验性习惯成长进度"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={result.progress}>
        <div className="growth-fill" style={{width:result.progress+"%"}}/>
      </div>
      <p>已执行 {result.completedRepetitions} 次 · 行动自动化信号：{result.automaticitySignal===null?"尚无证据":result.automaticitySignal.toFixed(1)}
        · 感受反馈 {result.evidenceCount} 次</p>
      {result.reviewDue&&<p className="review-prompt">{result.reviewReason==="recent_difficulty"?"最近开始行动似乎更费力了，做一次简短复查吧。":"该做一次低负担复查了：现在开始行动，还是和之前一样自然吗？"}</p>}
      {result.nextReviewAt&&<small>预计下次应用内复查：{new Date(result.nextReviewAt).toLocaleDateString("zh-CN")}</small>}
      <button type="button" className="text-button" disabled={busy} onClick={toggleReview}>{result.reviewEnabled?"关闭应用内复查":"开启应用内复查"}</button>
      <p className="progress-caveat">此百分比是产品成长指标，不是科学验证的“养成概率”；它不会直接改变任何能力分。</p>
    </>:<p>正在计算进度…</p>}
    <div className="growth-form">
      <strong>这一次开始行动时的感受（选填）</strong>
      <div className="feeling-options" role="group" aria-label="开始行动的自然程度">
        {options.map(([value,label])=><button type="button" key={value}
          className={value===level?"selected":""} aria-pressed={level===value}
          onClick={()=>setLevel(value)}>{label}</button>)}
      </div>
      <label htmlFor="growth-note">补充一句你的真实感受</label>
      <textarea id="growth-note" maxLength={600} value={note}
        onChange={e=>setNote(e.target.value)}
        placeholder="例如：看到电脑就自然打开笔记了，不需要纠结。"/>
      <label className="ai-opt-in"><input type="checkbox" checked={consent}
        disabled={!note.trim()} onChange={e=>setConsent(e.target.checked)}/>
        <span>同意将本条文字发送给配置的 AI 服务商做分析。默认不发送。</span>
      </label>
      <button type="button" className="save-feeling" disabled={busy||(!note.trim()&&!level)}
        onClick={save}>{busy?"保存中…":"保存本次感受"}</button>
      <p role="status" aria-live="polite">{message}</p>
    </div>
    <div className="growth-history">
      <h3>最近的感受记录</h3>
      {history.length===0?<p>暂无记录；不填写也可以继续打卡。</p>:history.map(entry=>
        <div key={entry.id} className="growth-history-row">
          <small>{new Date(entry.createdAt).toLocaleDateString("zh-CN")}
            {entry.initiationLevel!==null?" · 自评 "+(options[entry.initiationLevel]?.[1]??"已记录"):""}
            {entry.aiConsent?" · AI "+entry.aiStatus:" · 未授权 AI"}</small>
          {entry.note&&<p>{entry.note}</p>}
          {entry.aiQuote&&<small>AI 引用依据：{entry.aiQuote}（仅为暂定分析）</small>}
          <div className="habit-actions">
            {entry.aiConsent&&<button type="button" className="text-button" disabled={busy}
              onClick={()=>modifyReflection(entry,"revoke")}>撤回 AI 授权</button>}
            <button type="button" className="text-button" disabled={busy}
              onClick={()=>modifyReflection(entry,"delete")}>删除这条感受</button>
          </div>
        </div>)}
      <p className="progress-caveat">撤回未来处理不代表已经传送给第三方的文字可以被收回。正在处理中的请求无法保证取消。</p>
    </div>
  </section>;
}
