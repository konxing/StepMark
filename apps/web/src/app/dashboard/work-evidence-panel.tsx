"use client";
import {useCallback,useEffect,useRef,useState} from "react";

type EvidencePage={
  summary:{domain:string;label:string;reportedDays:number;outcomeDays:number}[];
  items:{id:string;domain:string;actionQuote:string;outcomeQuote:string|null;reportDay:string;outcomeNeedsReview:boolean}[];
  labels:Record<string,string>;nextOffset:number|null;
};
const endpoint="/api/v1/assistant/evidence";

export default function WorkEvidencePanel({revision}:{revision:number}){
  const [opened,setOpened]=useState(true);
  const [data,setData]=useState<EvidencePage|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const loadId=useRef(0);
  const load=useCallback(async(offset=0)=>{
    const id=++loadId.current;
    setBusy(true);setNotice("");
    try{
      const now=new Date();
      const localDate=[now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),
        String(now.getDate()).padStart(2,"0")].join("-");
      const response=await fetch(`${endpoint}?offset=${offset}&localDate=${localDate}`,{cache:"no-store"});
      if(!response.ok)throw new Error();
      const page=await response.json() as EvidencePage;
      if(loadId.current!==id)return;
      setData(previous=>offset&&previous?{...page,items:[...previous.items,...page.items.filter(item=>
        !previous.items.some(existing=>existing.id===item.id))]}:page);
    }catch{if(loadId.current===id)setNotice("暂时无法读取成长证据。");}
    finally{if(loadId.current===id)setBusy(false);}
  },[]);
  useEffect(()=>{if(opened)void load();},[opened,revision,load]);

  async function remove(id:string){
    if(busy||!window.confirm("删除这条成长证据？对应的统计也会更新。"))return;
    setBusy(true);
    try{
      const response=await fetch(`${endpoint}?id=${encodeURIComponent(id)}`,{method:"DELETE"});
      if(!response.ok&&response.status!==404)throw new Error();
      setData(previous=>previous?{...previous,items:previous.items.filter(item=>item.id!==id)}:previous);
      await load();
    }catch{setNotice("删除结果未确认，请稍后刷新。");}
    finally{setBusy(false);}
  }

  return <details open={opened} onToggle={event=>setOpened(event.currentTarget.open)}>
    <summary>能力成长证据 · 来自日常对话</summary>
    <p>近 30 天按你的本地报告日期计数。同一天、同一方向只计一天。相同的行动原话保留首次归类。</p>
    {data&&<>
      <ul>{data.summary.map(row=><li key={row.domain}>{row.label}：{row.reportedDays?
        `${row.reportedDays} 天报告行动，${row.outcomeDays} 天有对应结果原话`:"等待行动证据"}</li>)}</ul>
      {data.items.map(item=><article key={item.id} className="habit-row">
        <small>{data.labels[item.domain]??item.domain} · 报告于 {item.reportDay}</small>
        <p>{item.actionQuote}</p>{item.outcomeQuote&&<p>{item.outcomeQuote}</p>}
        {item.outcomeNeedsReview&&<p>这条旧记录的结果关联待核对。沿用这句行动原话，接着描述实际结果，可更新统计。</p>}
        <button type="button" className="text-button" disabled={busy} onClick={()=>void remove(item.id)}>删除这条证据</button>
      </article>)}
      {data.nextOffset!==null&&<button type="button" className="text-button" disabled={busy}
        onClick={()=>void load(data.nextOffset!)}>加载更早的证据</button>}
    </>}
    {data&&<p>以上为对话中的行动与结果证据，不是能力百分位。无需答卷；可以继续谈真实任务的思路、验证及结果。</p>}
    {busy&&<p role="status">正在处理…</p>}
    {notice&&<p role="status">{notice} <button type="button" className="text-button" disabled={busy}
      onClick={()=>void load()}>重试</button></p>}
  </details>;
}
