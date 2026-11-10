"use client";
import {useCallback,useEffect,useState} from "react";
type Habit={id:string;title:string;cue:string|null;action:string;createdAt:string;_count:{events:number;checks:number}};
export default function DashboardClient({email}:{email:string}) {
  const [habits,setHabits]=useState<Habit[]>([]);
  const [title,setTitle]=useState(""),[action,setAction]=useState(""),[cue,setCue]=useState("");
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [selected,setSelected]=useState<string|null>(null);
  const [events,setEvents]=useState<{eligible:boolean;completed:boolean}[]>([]);
  const load=useCallback(async()=>{
    const result=await fetch("/api/v1/habits",{cache:"no-store"});
    if(result.status===401){location.assign("/login");return;}
    if(!result.ok)throw new Error("LOAD_FAILED");
    const data=await result.json() as {habits:Habit[]};setHabits(data.habits);
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
  async function complete(habitId:string){
    if(busy)return;setBusy(true);setMessage("");
    // A calendar-day opportunity is only a lightweight tracking convenience.
    // It is NOT a validated indicator of automaticity.
    const today=new Date().toLocaleDateString("en-CA");
    try{
      const res=await fetch("/api/v1/observations",{method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({habitId,opportunityKey:`daily:${today}`,eligible:true,
          completed:true,occurredAt:new Date().toISOString()})});
      if(!res.ok && res.status!==409)throw new Error("SAVE_FAILED");
      await load();setMessage(res.status===409?"今天已有记录。":"已记录一次执行；这不会直接增加能力分。");
    }catch{setMessage("记录失败，请重试。");}finally{setBusy(false);}
  }
  async function detail(id:string){
    try{
      const r=await fetch(`/api/v1/observations?habitId=${encodeURIComponent(id)}`,{cache:"no-store"});
      if(!r.ok)throw new Error();
      const d=await r.json() as {events:{eligible:boolean;completed:boolean}[]};
      setSelected(id);setEvents(d.events);
    }catch{setMessage("无法读取记录。");}
  }
  async function logout(){
    await fetch("/api/v1/auth/logout",{method:"POST"});location.assign("/login");
  }
  const eligible=events.filter(e=>e.eligible).length,done=events.filter(e=>e.eligible&&e.completed).length;
  return <main className="dashboard-shell">
    <header className="dashboard-header"><a className="wordmark" href="/">STEP<span>MARK</span><span className="brand-dot">.</span></a>
      <div><span className="account-email">{email}</span> <a href="/settings" className="text-button">账户与数据</a> <button className="text-button" onClick={logout}>退出</button></div></header>
    <section className="dash-welcome"><span className="kicker">MY DEVELOPMENT</span><h1>今天，从一个小行动开始。</h1>
      <p>记录你的实际行为，不用一次分数定义自己。能力测量模块将在校准后加入。</p></section>
    <p className="assessment-link"><a href="/assess">开始实验性逻辑推理测量 ↗</a></p>
    <section className="dashboard-grid">
      <article className="dashboard-panel"><h2>建立一个新习惯</h2>
        <form className="account-form" onSubmit={create}>
          <label htmlFor="habit-title">习惯名称</label>
          <input id="habit-title" maxLength={180} minLength={2} required value={title} onChange={e=>setTitle(e.target.value)} placeholder="例如：表达前先说结论"/>
          <label htmlFor="habit-action">具体行动</label>
          <textarea id="habit-action" maxLength={500} minLength={2} required value={action} onChange={e=>setAction(e.target.value)} placeholder="例如：先用一句话概括结论，再解释原因"/>
          <label htmlFor="habit-cue">触发情境（选填）</label>
          <input id="habit-cue" maxLength={250} value={cue} onChange={e=>setCue(e.target.value)} placeholder="例如：当我要解释技术问题时"/>
          <button disabled={busy}>添加习惯</button>
        </form>
      </article>
      <article className="dashboard-panel"><h2>正在训练</h2>
        {habits.length===0?<p>还没有习惯，先创建一个可观察的行动。</p>:
          <div className="habits-list">{habits.map(h=><div className="habit-row" key={h.id}>
            <h3>{h.title}</h3><p>{h.action}</p>{h.cue&&<small>情境：{h.cue}</small>}
            <div className="habit-actions"><button disabled={busy} onClick={()=>complete(h.id)}>记录今天已执行</button>
              <button className="text-button" onClick={()=>detail(h.id)}>查看记录</button></div>
            <small>已记录机会：{h._count.events}（并非能力分）</small></div>)}</div>}
      </article>
    </section>
    {selected&&<section className="dashboard-panel" aria-live="polite"><h2>执行情况</h2><p>最近 {events.length} 条记录中，符合执行条件的机会有 {eligible} 次，完成 {done} 次。</p>
      <p>观察完成率：{eligible>0?`${Math.round(done/eligible*100)}%`:"暂无有效观察"}。自动化程度需要独立测量。</p></section>}
    <p className="notice" role="status" aria-live="polite">{message}</p>
  </main>;
}
