"use client";
import {useCallback,useEffect,useState} from "react";
type Progress={progress:number;repetitionSignal:number;automaticitySignal:number|null;
  completedRepetitions:number;evidenceCount:number;reviewDue:boolean;nextReviewAt:string|null;
  stage:string;policyVersion:string};
const options=[
  ["0","非常抗拒"],["1","需要逼自己"],["2","有一点纠结"],
  ["3","比较自然"],["4","几乎不用思考"]
] as const;
export default function HabitGrowthPanel({habitId,eventId}:{habitId:string;eventId?:string|null}) {
  const [result,setResult]=useState<Progress|null>(null);
  const [level,setLevel]=useState<string>("");
  const [note,setNote]=useState("");
  const [linkedEventId,setLinkedEventId]=useState(eventId??null);
  const [consent,setConsent]=useState(false);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const load=useCallback(async()=>{
    const response=await fetch("/api/v1/habits/"+habitId+"/progress",{cache:"no-store"});
    if(!response.ok)throw new Error("NO_PROGRESS");
    setResult(await response.json() as Progress);
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
      {result.reviewDue&&<p className="review-prompt">该做一次低负担复查了：现在开始行动，还是和之前一样自然吗？</p>}
      {result.nextReviewAt&&<small>预计下次应用内复查：{new Date(result.nextReviewAt).toLocaleDateString("zh-CN")}</small>}
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
  </section>;
}
