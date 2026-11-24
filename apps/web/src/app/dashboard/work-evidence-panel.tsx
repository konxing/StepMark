"use client";
import {useCallback,useEffect,useRef,useState} from "react";

type EvidencePage={
  summary:{domain:string;label:string;reportedDays:number;outcomeDays:number}[];
  items:{id:string;domain:string;actionQuote:string;outcomeQuote:string|null;reportDay:string}[];
  labels:Record<string,string>;nextOffset:number|null;
};
const endpoint="/api/v1/assistant/evidence";

export default function WorkEvidencePanel({revision}:{revision:number}){
  const [opened,setOpened]=useState(false);
  const [data,setData]=useState<EvidencePage|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const loadId=useRef(0);
  const load=useCallback(async(offset=0)=>{
    const id=++loadId.current;
    setBusy(true);setNotice("");
    try{
      const response=await fetch(`${endpoint}?offset=${offset}`,{cache:"no-store"});
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

  return <details onToggle={event=>setOpened(event.currentTarget.open)}>
    <summary>查看成长证据</summary>
    <p>近 30 天按报告日期计数。同一天、同一方向只计一天。数字反映聊天里报告的行动和结果。</p>
    {data&&<>
      <ul>{data.summary.map(row=><li key={row.domain}>{row.label}：{row.reportedDays?
        `${row.reportedDays} 天有行动，${row.outcomeDays} 天有结果`:"证据不足"}</li>)}</ul>
      {data.items.map(item=><article key={item.id} className="habit-row">
        <small>{data.labels[item.domain]??item.domain} · 报告于 {item.reportDay}</small>
        <p>{item.actionQuote}</p>{item.outcomeQuote&&<p>{item.outcomeQuote}</p>}
        <button type="button" className="text-button" disabled={busy} onClick={()=>void remove(item.id)}>删除这条证据</button>
      </article>)}
      {data.nextOffset!==null&&<button type="button" className="text-button" disabled={busy}
        onClick={()=>void load(data.nextOffset!)}>加载更早的证据</button>}
    </>}
    {busy&&<p role="status">正在处理…</p>}
    {notice&&<p role="status">{notice} <button type="button" className="text-button" disabled={busy}
      onClick={()=>void load()}>重试</button></p>}
  </details>;
}
