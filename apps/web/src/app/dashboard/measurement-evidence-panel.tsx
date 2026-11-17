"use client";
import {useEffect,useState} from "react";
type Evidence={
  evidenceGrade:"E0";evidenceGradeLabel:string;verifiedCompletedItems:number;
  observations:{status:string;itemsCorrect:number|null;totalItems:number}[];
  ability:{status:"not_estimated";theta:null;populationPercentile:null};
  change:{status:"insufficient_evidence";message:string};
};
/** A compact, user-scoped evidence summary. No answer keys or item content. */
export default function MeasurementEvidencePanel(){
  const [data,setData]=useState<Evidence|null>(null);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    let active=true;
    void fetch("/api/v1/measurement-evidence",{cache:"no-store"})
      .then(async response=>{
        if(!response.ok)throw new Error("measurement-evidence");
        return response.json() as Promise<Evidence>;
      }).then(value=>{if(active)setData(value);})
      .catch(()=>{if(active)setFailed(true);});
    return ()=>{active=false;};
  },[]);
  return <section className="dashboard-panel" aria-label="个人能力测量证据">
    <h2>能力测量 · 科学证据</h2>
    {data?<>
      <p><strong>{data.evidenceGrade} · {data.evidenceGradeLabel}</strong></p>
      <p>可核验的已完成客观题：{data.verifiedCompletedItems} 道。
        目前没有经过独立校准的能力分数或人口百分位。</p>
      <p>真实能力变化：<strong>证据不足，暂不能判断</strong>。</p>
      <p className="progress-caveat">{data.change.message}</p>
      <p><a href="/assess">查看原始答题证据与解释</a></p>
    </>:failed?
      <p>测量证据暂时不可用。请稍后进入测验页面检查记录。</p>:
      <p>正在获取可核验的测量证据…</p>}
  </section>;
}
