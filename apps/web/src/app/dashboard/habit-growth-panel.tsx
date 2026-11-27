"use client";
import {useCallback,useEffect,useState} from "react";
import HabitTrainingPanel from "./habit-training-panel";
type Progress={progress:number;repetitionSignal:number;automaticitySignal:number|null;
  chatAutomaticity?:{days:number;medianLow:number;medianHigh:number;stale:boolean}|null;
  eligibleOpportunities?:number;observedCompletionRate?:number|null;
  recentExecution?:{completed:number;eligible:number;inconsistent:boolean}|null;
  completedRepetitions:number;evidenceCount:number;aiAnnotationCount:number;reviewDue:boolean;nextReviewAt:string|null;
  stage:string;policyVersion:string;reviewEnabled:boolean;reviewReason:string;evidenceStale:boolean;lastRatingAt:string|null};
type Reflection = {id:string;eventId:string|null;note:string|null;initiationLevel:number|null;
  aiConsent:boolean;aiStatus:string;aiLevel:number|null;aiQuote:string|null;createdAt:string};
const options=[
  ["0","非常抗拒"],["1","需要逼自己"],["2","有一点纠结"],
  ["3","比较自然"],["4","几乎不用思考"]
] as const;
const stages:Record<string,string>={collecting_evidence:"收集证据",developing:"形成中",
  maintaining:"维护观察",review_due:"建议复查",needs_fresh_evidence:"等待更新自评"};

export default function HabitGrowthPanel({habitId,habitTitle,eventId,revision,onEvidenceChanged}:{
  habitId:string;habitTitle:string;eventId?:string|null;revision:number;onEvidenceChanged:()=>void
}) {
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
  useEffect(()=>{setLinkedEventId(eventId??null);void load().catch(()=>setMessage("进度暂时无法读取。"));},[load,eventId,revision]);
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
      onEvidenceChanged();
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
      onEvidenceChanged();
      await load();
      setMessage(data.mayHaveBeenSentToProvider?
        "已更新 StepMark 内的数据和后续授权，但以前发送给服务商的文字不能被撤回。":
        action==="delete"?"已删除这条感受及相关的本地分析。":"已撤回 AI 授权，保留你的原始自评。");
    }catch{setMessage("网络错误，未能完成操作。");}finally{setBusy(false);}
  }
  async function addSelfRating(reflectionId:string,initiationLevel:number){
    if(busy)return;
    setBusy(true);setMessage("");
    try{
      const response=await fetch(`/api/v1/habits/${habitId}/reflections/${reflectionId}`,{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({initiationLevel})
      });
      if(response.status===409){
        await load();
        setMessage("这条记录已有自评，或关联的行动已更改。记录已刷新。");
        return;
      }
      if(!response.ok)throw new Error();
      setHistory(rows=>rows.map(row=>row.id===reflectionId?{...row,initiationLevel}:row));
      onEvidenceChanged();
      setMessage("本人启动感受已保存。");
      await load().catch(()=>setMessage("本人启动感受已保存，进度暂时无法刷新。"));
    }catch{setMessage("无法确认是否保存，稍后可重试同一选项。");}
    finally{setBusy(false);}
  }
  return <section id="habit-progress" className="dashboard-panel" aria-label="习惯养成进度">
    <h2>{habitTitle} · 养成进度</h2>
    {result ? <>
      <div className="progress-head">
        <strong>{result.progress.toFixed(1)} <small>/ 100</small></strong>
        <span>{result.evidenceStale?"历史进度 · 自评待更新":stages[result.stage]??"等待证据"}</span>
      </div>
      <div className="growth-track" role="progressbar" aria-label="习惯养成进度"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={result.progress}>
        <div className="growth-fill" style={{width:result.progress+"%"}}/>
      </div>
      <div className="habit-measures">
        <p><small>累计完成</small><strong>{result.completedRepetitions} / {result.eligibleOpportunities??result.completedRepetitions} 次有机会</strong></p>
        <p><small>近期执行</small><strong>{result.recentExecution?`${result.recentExecution.completed} / ${result.recentExecution.eligible} 次`:"待记录"}</strong></p>
        <p><small>本人启动感受</small><strong>{result.automaticitySignal===null?"待自评":`${result.automaticitySignal.toFixed(1)} / 100 · ${result.evidenceCount} 天`}</strong></p>
      </div>
      <p className="progress-caveat">进度用于查看这项习惯的变化。得分依据实际执行和本人自评，近期最多取 12 次有触发的已记录机会。</p>
      {result.recentExecution?.inconsistent&&<p className="review-prompt">近期多次有机会但未执行，当前分数低于稳定区间。可以先调整触发情境或把行动缩小。</p>}
      {result.chatAutomaticity && (
        <p className="progress-caveat">
          聊天启动感受 {result.chatAutomaticity.medianLow === result.chatAutomaticity.medianHigh
            ? result.chatAutomaticity.medianLow
            : `${result.chatAutomaticity.medianLow}–${result.chatAutomaticity.medianHigh}`} / 4。
          来自 {result.chatAutomaticity.days} 个实际执行日的{result.chatAutomaticity.stale ? "历史证据" : " AI 暂定观察"}。
        </p>
      )}
      {result.aiAnnotationCount>0&&<p className="progress-caveat">历史记录有 {result.aiAnnotationCount} 条仅 AI 暂定解读，未参与进度和复查判断。</p>}
      {result.evidenceStale&&<p className="review-prompt">
        过去的感受证据已超过 45 天。这是上次有证据支持的进度，并非当前状态的可靠判断；缺少记录不会自动扣分。
      </p>}
      {result.reviewDue&&<p className="review-prompt">{result.reviewReason==="recent_difficulty"?"最近开始行动似乎更费力了，做一次简短复查吧。":result.reviewReason==="recent_misses"?"请复查这段时间的触发情境和行动难度。":"复查一下，现在开始行动时有多自然？"}</p>}
      {result.nextReviewAt&&<small>预计下次应用内复查：{new Date(result.nextReviewAt).toLocaleDateString("zh-CN")}</small>}
      <button type="button" className="text-button" disabled={busy} onClick={toggleReview}>{result.reviewEnabled?"关闭应用内复查":"开启应用内复查"}</button>
    </>:<p role="status">{message||"正在计算进度…"}</p>}
    <details>
      <summary>可选：历史训练与短卷记录</summary>
      <HabitTrainingPanel habitId={habitId} revision={revision} onChanged={onEvidenceChanged}/>
    </details>
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
          {entry.eventId&&entry.initiationLevel===null&&<details>
            <summary>补记当时的启动感受</summary>
            {entry.aiLevel!==null&&entry.aiQuote&&<p>
              AI 建议「{options[entry.aiLevel]?.[1]}」，依据「{entry.aiQuote}」。请选择你自己的真实感受。
            </p>}
            <div className="feeling-options" role="group" aria-label="选择并保存本人启动感受">
              {options.map(([value,label])=><button type="button" key={value} disabled={busy}
                onClick={()=>addSelfRating(entry.id,Number(value))}>{label}</button>)}
            </div>
          </details>}
          {entry.aiQuote&&(!entry.eventId||entry.initiationLevel!==null)&&<details><summary>查看 AI 暂定解读</summary>
            <small>{entry.aiQuote}</small>
          </details>}
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
