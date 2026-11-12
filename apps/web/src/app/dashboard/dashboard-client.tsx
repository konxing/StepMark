"use client";
import HabitGrowthPanel from "./habit-growth-panel";
import AssistantChatPanel from "./assistant-chat-panel";
import {useCallback,useEffect,useState} from "react";
type Habit={id:string;title:string;cue:string|null;action:string;createdAt:string;_count:{events:number;checks:number}};
type Correction={id:string;revision:number;previousEligible:boolean;previousCompleted:boolean;
  updatedEligible:boolean;updatedCompleted:boolean;source:string;correctedAt:string};
function stateLabel(eligible:boolean,completed:boolean){
  return !eligible?"没有触发机会":completed?"已执行":"有机会但未执行";
}
export default function DashboardClient({email}:{email:string}) {
  const [habits,setHabits]=useState<Habit[]>([]);
  const [showManual,setShowManual]=useState(false);
  const [showCorrections,setShowCorrections]=useState(false);
  const [dueReviews,setDueReviews]=useState<{habitId:string;title:string;progress:number;reviewReason:string}[]>([]);
  const [title,setTitle]=useState(""),[action,setAction]=useState(""),[cue,setCue]=useState("");
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [selected,setSelected]=useState<string|null>(null);
  const [reflectionEventId,setReflectionEventId]=useState<string|null>(null);
  const [events,setEvents]=useState<{id:string;opportunityKey:string;eligible:boolean;completed:boolean;occurredAt:string;revision:number}[]>([]);
  const [correcting,setCorrecting]=useState<string|null>(null);
  const [historyEventId,setHistoryEventId]=useState<string|null>(null);
  const [historyRows,setHistoryRows]=useState<Correction[]>([]);
  const [historyNextOffset,setHistoryNextOffset]=useState<number|null>(null);
  const [historyBusy,setHistoryBusy]=useState(false);
  const [insights,setInsights]=useState<null|{eligibleOpportunities:number;completions:number;
    observedRate:number|null;wilsonInterval95:{low:number;high:number}|null;
    posterior:{posteriorMean:number;posteriorSD:number}|null;
    latestAutomaticity:{indexScore:number;measuredAt:string}|null}>(null);
  const load=useCallback(async()=>{
    const [result,reviewResult]=await Promise.all([
      fetch("/api/v1/habits",{cache:"no-store"}),
      fetch("/api/v1/habits/due",{cache:"no-store"})
    ]);
    if(result.status===401){location.assign("/login");return;}
    if(!result.ok)throw new Error("LOAD_FAILED");
    const data=await result.json() as {habits:Habit[]};
    setHabits(data.habits);
    if(reviewResult.ok){
      const reviews=await reviewResult.json() as {due:{habitId:string;title:string;progress:number;reviewReason:string}[]};
      setDueReviews(reviews.due);
    }
  },[]);
  useEffect(()=>{void load().catch(()=>setMessage("读取失败，请检查数据库连接。"));},[load]);
  async function create(e:React.FormEvent){
    e.preventDefault();if(busy)return;setBusy(true);setMessage("");
    try{
      const res=await fetch("/api/v1/habits",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({title,action,cue:cue||undefined})});
      if(!res.ok)throw new Error("CREATE_FAILED");
      setTitle("");setAction("");setCue("");await load();setMessage("习惯已添加。");
    }catch{setMessage("创建失败，请重试。");}finally{setBusy(false);}
  }
  async function recordOpportunity(habitId:string,kind:"done"|"missed"|"no_cue"){
    if(busy)return;setBusy(true);setMessage("");
    // A calendar-day opportunity is only a lightweight tracking convenience.
    // It is NOT a validated indicator of automaticity.
    const today=new Date().toLocaleDateString("en-CA");
    try{
      const res=await fetch("/api/v1/observations",{method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({habitId,opportunityKey:`daily:${today}`,eligible:kind!=="no_cue",
          completed:kind==="done",occurredAt:new Date().toISOString()})});
      if(!res.ok && res.status!==409)throw new Error("SAVE_FAILED");
      const parsed= res.ok ? await res.json() as {event:{id:string}} : null;
      await load();await detail(habitId,kind==="done"?(parsed?.event.id??null):null);
      const names={done:"执行已保存；可选填一次感受。",missed:"记录为有机会但未执行。不会直接扣减习惯进度。",
        no_cue:"记录为今天没有出现触发情境，不计为执行失败。"};
      setMessage(res.status===409?"本日已有不同状态的记录；如需纠错请查看记录。":names[kind]);
    }catch{setMessage("记录失败，请重试。");}finally{setBusy(false);}
  }
  async function refreshEvents(id:string){
    const response=await fetch("/api/v1/observations?habitId="+encodeURIComponent(id),{cache:"no-store"});
    if(!response.ok)throw new Error("EVENTS_FAILED");
    const body=await response.json() as {events:typeof events};
    setEvents(body.events);
  }
  async function showCorrectionHistory(eventId:string,offset=0){
    if(historyBusy)return;
    setHistoryBusy(true);
    try{
      const response=await fetch("/api/v1/observations/"+encodeURIComponent(eventId)+
        "?offset="+offset,{cache:"no-store"});
      if(!response.ok)throw new Error("HISTORY_FAILED");
      const body=await response.json() as {corrections:Correction[];nextOffset:number|null};
      setHistoryEventId(eventId);
      setHistoryRows(old=>offset===0?body.corrections:[...old,...body.corrections]);
      setHistoryNextOffset(body.nextOffset);
    }catch{setMessage("更正历史读取失败，请稍后重试。");}
    finally{setHistoryBusy(false);}
  }
  async function correctOpportunity(event:typeof events[number],kind:"done"|"missed"|"no_cue"){
    if(!selected||correcting)return;
    const eligible=kind!=="no_cue",completed=kind==="done";
    if(event.eligible===eligible&&event.completed===completed)return;
    setCorrecting(event.id);
    try{
      const res=await fetch("/api/v1/observations/"+encodeURIComponent(event.id),{
        method:"PUT",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({expectedRevision:event.revision,eligible,completed})
      });
      if(!res.ok){
        const data=await res.json().catch(()=>null) as {error?:{code?:string}}|null;
        const code=data?.error?.code;
        setMessage(code==="DELETE_LINKED_REFLECTION_FIRST"?
          "这条执行记录关联了感受记录，请先在下方删除对应感受，再更正状态。":
          code==="STALE_OPPORTUNITY_REVISION"?"记录已在其他设备更改，已刷新列表，请重新选择。":
          "更正失败，请刷新后重试。");
        await refreshEvents(selected);
        return;
      }
      await Promise.all([refreshEvents(selected),load()]);
      await detail(selected);
      setMessage("更正已保存，可点击“更正历史”核对每次修改。");
    }catch{setMessage("网络错误，更正未确认。");}
    finally{setCorrecting(null);}
  }
  async function detail(id:string,eventId:string|null=null){
    try{
      const r=await fetch(`/api/v1/habits/${encodeURIComponent(id)}/insights`,{cache:"no-store"});
      if(!r.ok)throw new Error();
      const report=await r.json() as NonNullable<typeof insights>;
      setSelected(id);setReflectionEventId(eventId);setInsights(report);
      setShowCorrections(false);
      setHistoryEventId(null);setHistoryRows([]);setHistoryNextOffset(null);
      await refreshEvents(id);
    }catch{setMessage("无法读取记录。");}
  }
  async function logout(){
    await fetch("/api/v1/auth/logout",{method:"POST"});location.assign("/login");
  }
  return <main className="dashboard-shell">
    <header className="dashboard-header"><a className="wordmark" href="/">STEP<span>MARK</span><span className="brand-dot">.</span></a>
      <div><span className="account-email">{email}</span> <a href="/settings" className="text-button">账户与数据</a> <button className="text-button" onClick={logout}>退出</button></div></header>
    <section className="dash-welcome"><span className="kicker">MY DEVELOPMENT</span><h1>和 AI 说说，今天有什么进展。</h1>
      <p>用对话创建习惯、记录执行或感受；客观测验与习惯成长证据依然分开。</p></section>
    <AssistantChatPanel onChanged={async id=>{await load();if(id)await detail(id);}}/>
    <button type="button" className="assistant-advanced-toggle" onClick={()=>setShowManual(x=>!x)}
      aria-expanded={showManual}>{showManual?"收起手动管理":"展开手动管理与详细记录"}</button>
    {dueReviews.length>0&&<section className="dashboard-panel due-review-panel">
      <h2>值得简短复查的习惯</h2>
      <p>只是应用内提示，不发送消息；也不会因为你没有填写感受而直接判定退步。</p>
      <div className="due-review-list">
        {dueReviews.slice(0,4).map(review=><button type="button" key={review.habitId}
          onClick={()=>detail(review.habitId)}>
          <span>{review.title}</span>
          <small>{review.reviewReason==="recent_difficulty"?"最近启动更费力": "看看现在是否仍然自然"}</small>
        </button>)}
      </div>
    </section>}
    <p className="assessment-link"><a href="/assess">开始实验性逻辑推理测量 ↗</a> · <a href="/practice">进行独立题库的推理专项训练 ↗</a></p>
    <section className={showManual?"dashboard-grid":"dashboard-grid dashboard-grid-single"}>
      {showManual&&<article className="dashboard-panel"><h2>手动建立习惯（备用入口）</h2>
        <form className="account-form" onSubmit={create}>
          <label htmlFor="habit-title">习惯名称</label>
          <input id="habit-title" maxLength={180} minLength={2} required value={title} onChange={e=>setTitle(e.target.value)} placeholder="例如：表达前先说结论"/>
          <label htmlFor="habit-action">具体行动</label>
          <textarea id="habit-action" maxLength={500} minLength={2} required value={action} onChange={e=>setAction(e.target.value)} placeholder="例如：先用一句话概括结论，再解释原因"/>
          <label htmlFor="habit-cue">触发情境（选填）</label>
          <input id="habit-cue" maxLength={250} value={cue} onChange={e=>setCue(e.target.value)} placeholder="例如：当我要解释技术问题时"/>
          <button disabled={busy}>添加习惯</button>
        </form>
      </article>}
      <article className="dashboard-panel"><h2>已记录的习惯</h2>
        {habits.length===0?<p>还没有习惯，先创建一个可观察的行动。</p>:
          <div className="habits-list">{habits.map(h=><div className="habit-row" key={h.id}>
            <h3>{h.title}</h3><p>{h.action}</p>{h.cue&&<small>情境：{h.cue}</small>}
            <div className="habit-actions habit-opportunity-actions">
              {showManual&&<button disabled={busy} onClick={()=>recordOpportunity(h.id,"done")}>已执行</button>}
              {showManual&&<button disabled={busy} className="text-button" onClick={()=>recordOpportunity(h.id,"missed")}>有机会，没执行</button>}
              {showManual&&<button disabled={busy} className="text-button" onClick={()=>recordOpportunity(h.id,"no_cue")}>今天没机会</button>}
              <button className="text-button" onClick={()=>detail(h.id)}>成长进度</button>
            </div>
            <small>已记录天数：{h._count.events}（并非能力分）</small></div>)}</div>}
      </article>
    </section>
    {selected&&insights&&<section className="dashboard-panel" aria-live="polite">
      <h2>习惯执行情况 · 统计解释</h2>
      <p>有触发机会 {insights.eligibleOpportunities} 次，完成 {insights.completions} 次。没有出现触发情境的日子不计入分母。</p>
      <p>实际观察完成率：{insights.observedRate===null?"数据不足":(insights.observedRate*100).toFixed(1)+"%"}。</p>
      {insights.posterior&&<p>贝叶斯平滑预测：{(insights.posterior.posteriorMean*100).toFixed(1)}%（标准差 {(insights.posterior.posteriorSD*100).toFixed(1)} 个百分点）。
      采用 Beta(1,1) 先验，只是对后续类似执行机会的描述性预测。</p>}
      {insights.wilsonInterval95&&<p>观察比例粗略 95% 区间：
        {(insights.wilsonInterval95.low*100).toFixed(1)}%—{(insights.wilsonInterval95.high*100).toFixed(1)}%。
        重复行为可能相关，因此此区间不应当被当作严格保证。</p>}
      {insights.latestAutomaticity?<p>最近一次试验性自动化指数：{insights.latestAutomaticity.indexScore.toFixed(1)}/100（不是已验证量表或能力值）。</p>:
        <p>还没有自动化程度的独立测量。完成次数不能证明习惯已经形成。</p>}
    </section>}
    {selected&&<button type="button" className="assistant-advanced-toggle"
      aria-expanded={showCorrections} onClick={()=>setShowCorrections(x=>!x)}>
      {showCorrections?"收起历史更正工具":"查看或更正最近执行记录"}
    </button>}
    {selected&&showCorrections&&<section className="dashboard-panel">
      <h2>最近记录 · 更正状态</h2>
      <p>误选“已执行 / 没执行 / 没机会”时，可在这里更正。每次更正会保留审计历史，不会重复增加次数。</p>
      {events.length===0?<p>暂无记录。</p>:events.slice(0,14).map(event=><div className="habit-row" key={event.id}>
        <p>{new Date(event.occurredAt).toLocaleDateString("zh-CN")} · 当前：{stateLabel(event.eligible,event.completed)} · 版本 {event.revision}</p>
        <div className="habit-actions">
          {(["done","missed","no_cue"] as const).map(kind=><button key={kind} type="button"
            disabled={correcting!==null || (event.eligible===(kind!=="no_cue")&&event.completed===(kind==="done"))}
            className="text-button" onClick={()=>correctOpportunity(event,kind)}>
            {kind==="done"?"改为已执行":kind==="missed"?"改为未执行":"改为无机会"}
          </button>)}
          {event.revision>0&&<button type="button" className="text-button" disabled={historyBusy}
            onClick={()=>{if(historyEventId===event.id){
              setHistoryEventId(null);setHistoryRows([]);setHistoryNextOffset(null);
            }else{void showCorrectionHistory(event.id);}}}>
            {historyEventId===event.id?"收起更正历史":"查看更正历史"}
          </button>}
        </div>
        {historyEventId===event.id&&<div className="growth-history" aria-live="polite">
          <h3>这条记录的修改过程</h3>
          {historyRows.map(entry=><p key={entry.id}>
            版本 {entry.revision} · {new Date(entry.correctedAt).toLocaleString("zh-CN")} ·
            {stateLabel(entry.previousEligible,entry.previousCompleted)} → {stateLabel(entry.updatedEligible,entry.updatedCompleted)}
          </p>)}
          {historyNextOffset!==null&&<button type="button" className="text-button"
            disabled={historyBusy} onClick={()=>void showCorrectionHistory(event.id,historyNextOffset)}>
            {historyBusy?"读取中…":"加载更多历史"}
          </button>}
        </div>}
      </div>)}
    </section>}
    {selected&&<HabitGrowthPanel key={selected} habitId={selected} eventId={reflectionEventId}/>}
    <p className="notice" role="status" aria-live="polite">{message}</p>
  </main>;
}
