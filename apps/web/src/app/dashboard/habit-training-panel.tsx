"use client";
import {useCallback,useEffect,useState} from "react";

type Form={status:string;correct:number|null;total:number;integrity:string;availableAt:string|null};
type Training={target:null}|{
  target:"reasoning.logic";baseline:Form|null;retest:Form|null;
  recordedTrainingBetweenTests:number|null;rawDifferencePoints:number|null;
};

function describeForm(form:Form|null,fallback:string){
  if(!form||form.status==="unavailable")return "测评暂不可用";
  if(form.correct!==null)return `${form.correct} / ${form.total} 道`+
    (form.integrity==="verified"?"":" · 历史记录待核验");
  if(form.status==="locked"&&form.availableAt){
    return new Date(form.availableAt).toLocaleDateString("zh-CN")+"开放";
  }
  if(form.status==="in_progress")return "答题中";
  return fallback;
}

export default function HabitTrainingPanel({habitId,revision,onChanged}:{
  habitId:string;revision:number;onChanged:()=>void
}){
  const endpoint=`/api/v1/habits/${encodeURIComponent(habitId)}/training`;
  const [training,setTraining]=useState<Training|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const load=useCallback(async(signal?:AbortSignal)=>{
    const response=await fetch(endpoint,{cache:"no-store",...(signal?{signal}:{})});
    if(!response.ok)throw new Error("TRAINING_LOAD_FAILED");
    const data=await response.json() as Training;
    if(!signal?.aborted)setTraining(data);
  },[endpoint]);
  useEffect(()=>{
    const controller=new AbortController();
    void load(controller.signal).catch(()=>{
      if(!controller.signal.aborted)setMessage("训练关联暂时无法读取。");
    });
    return ()=>controller.abort();
  },[load,revision]);

  async function save(target:Training["target"]){
    setBusy(true);setMessage("");
    try{
      const response=await fetch(endpoint,{method:"PUT",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({target})});
      if(!response.ok)throw new Error("TRAINING_SAVE_FAILED");
      onChanged();
      await load();
    }catch{setMessage("无法确认训练关联，请刷新后重试。");}
    finally{setBusy(false);}
  }

  return <section className="habit-training" aria-label="相关能力复测">
    <h3>相关能力复测</h3>
    {training?.target ? <>
      <div className="habit-measures">
        <p><small>逻辑推理初测</small><strong>{describeForm(training.baseline,"待初测")}</strong></p>
        <p><small>逻辑推理复测</small><strong>{describeForm(training.retest,"待复测")}</strong></p>
      </div>
      {training.recordedTrainingBetweenTests!==null&&<p>初测和关联生效后，已记录 {training.recordedTrainingBetweenTests} 次复测前的习惯练习。</p>}
      {training.rawDifferencePoints!==null&&<p>答题正确率相差 {training.rawDifferencePoints>0?"+":""}{training.rawDifferencePoints} 个百分点。当前为两份短卷上的表现对照。</p>}
      {training.retest?.status==="completed"&&training.rawDifferencePoints===null&&
        <p>训练对照需要可核验的初测与复测，以及两次测验之间的关联习惯记录。</p>}
      <div className="habit-actions">
        <a className="text-button" href="/assess">打开逻辑推理测评</a>
        <button type="button" className="text-button" disabled={busy} onClick={()=>void save(null)}>取消训练关联</button>
      </div>
    </>:training ? <>
      <p>如果这个习惯用于练习逻辑推理，可以关联初测、期间的练习记录和复测表现。</p>
      <button type="button" className="text-button" disabled={busy} onClick={()=>void save("reasoning.logic")}>关联逻辑推理</button>
    </>:message ? <>
      <button type="button" className="text-button" onClick={()=>{setMessage("");void load().catch(()=>setMessage("训练关联暂时无法读取。"));}}>重试</button>
    </>:<p role="status">正在读取训练关联…</p>}
    {message&&<p role="status">{message}</p>}
  </section>;
}
