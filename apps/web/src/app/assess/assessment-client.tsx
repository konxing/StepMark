"use client";
import {useCallback,useEffect,useState} from "react";

type Task={id:string;version:string;skillCode:string|null;prompt:string;options:{key:string;label:string}[]};
type Dimension={code:string;label:string;total:number;attempted:number;correct:number|null};
type Review={taskId:string;taskVersion:string;skillCode:string|null;prompt:string;
  selectedKey:string|null;correctKey:string|null;explanation:string;correct:boolean};
type FormSummary={code:string;title:string;phase:string;status:string;total:number;attempted:number;
  integrityStatus:"verified"|"legacy_unverified"|"mismatch";legacyAttemptCount:number;
  correct:number|null;completedAt:string|null;availableAt:string|null;dimensions:Dimension[];reviews:Review[]};
type MeasurementEvidence={
  policyVersion:"measurement-evidence-v1";evidenceGrade:"E0";
  evidenceGradeLabel:string;verifiedCompletedItems:number;
  ability:{status:"not_estimated";theta:null;standardError:null;
    measurementInterval95:null;populationPercentile:null;compositeAbility:null};
  change:{status:"insufficient_evidence";reliableChange:null;mdc95:null;
    practiceAdjustedDelta:null;message:string};
  blockedBy:string[];
  observations:{code:string;status:string;itemsAttempted:number;itemsCorrect:number|null;
    totalItems:number;observedAt:string|null;sourceIntegrity:string}[];
};
type Overview={forms:FormSummary[];measurementEvidence:MeasurementEvidence;comparison:{
  baselineCorrect:number;retestCorrect:number;total:number;rawDifferencePoints:number;daysApart:number;
  practiceAttemptsBetweenForms:number
}|null;interpretation:string};
const skills:Record<string,string>={conditional:"条件推理",evidence:"论证与证据",quantitative:"数量与比例"};
function statusText(form:FormSummary){
  if(form.status==="completed")return "已完成";
  if(form.status==="in_progress")return "进行中";
  if(form.status==="ready")return "可以开始";
  if(form.status==="unavailable")return "题库未就绪";
  return form.availableAt?"最早 "+new Date(form.availableAt).toLocaleDateString("zh-CN")+" 可复测":"先完成 A 卷";
}

export default function AssessmentClient(){
  const [overview,setOverview]=useState<Overview|null>(null);
  const [active,setActive]=useState<string|null>(null);
  const [tasks,setTasks]=useState<Task[]>([]);
  const [selected,setSelected]=useState("");
  const [busy,setBusy]=useState(false);
  const [submitted,setSubmitted]=useState(false);
  const [message,setMessage]=useState("正在读取独立测验…");
  const [loading,setLoading]=useState(true);
  const refresh=useCallback(async(preferred?:string)=>{
    setLoading(true);
    try{
      const response=await fetch("/api/v1/assessment-forms",{cache:"no-store"});
      if(response.status===401){location.assign("/login");return;}
      if(!response.ok)throw new Error("FORM_LOAD_FAILED");
      const body=await response.json() as Overview;
      setOverview(body);
      const choice=body.forms.find(f=>f.code===preferred) ??
        body.forms.find(f=>f.status==="in_progress"||f.status==="ready") ?? body.forms[0];
      const code=choice?.code??null;
      setActive(code);setSelected("");setSubmitted(false);
      if(choice && (choice.status==="ready"||choice.status==="in_progress")){
        const itemsResponse=await fetch("/api/v1/tasks?construct=reasoning.logic&form="+
          encodeURIComponent(choice.code),{cache:"no-store"});
        if(!itemsResponse.ok)throw new Error("TASK_LOAD_FAILED");
        const items=await itemsResponse.json() as {tasks:Task[]};
        setTasks(items.tasks);
        setMessage(items.tasks.length?"请选择答案。整卷完成前不公布正确答案。":"这一批次暂无待完成题目。");
      }else{
        setTasks([]);
        setMessage(choice?.status==="completed"?"该卷已完成，以下为你的个人证据与答题解析。":
          choice?.status==="locked"?"复测暂未开放；完成初测后至少间隔 7 天。":"题库尚未初始化。");
      }
    }catch{
      setTasks([]);setMessage("测验加载失败，请检查网络与数据库服务。");
    }finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);

  const current=overview?.forms.find(f=>f.code===active);
  const task=tasks[0];
  async function submit(){
    if(!task||!selected||busy||submitted)return;
    setBusy(true);
    try{
      const response=await fetch("/api/v1/assessments",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({taskId:task.id,selectedKey:selected})
      });
      if(!response.ok){
        setMessage(response.status===409?
          "本题已提交或复测尚未开放。请刷新测验状态。":"提交失败，请重试。");
        return;
      }
      const result=await response.json() as {deferredFeedback?:boolean};
      if(!result.deferredFeedback){
        setMessage("收到非预期的评分响应，请刷新测验状态。");return;
      }
      setSubmitted(true);
      setMessage("答案已保存。完成整卷后统一显示正确率与解析，避免即时反馈干扰同卷测量。");
    }catch{setMessage("网络故障，未能确认提交，请刷新检查。");}
    finally{setBusy(false);}
  }

  return <main className="account-shell assess-shell">
    <a className="wordmark" href="/">STEP<span>MARK</span><span className="brand-dot">.</span></a>
    <div className="assess-top"><a href="/dashboard">← 我的成长控制台</a><span>独立测验 · 实验阶段</span></div>
    <div className="kicker">REASONING DEMO · V1</div>
    <h1>思维能力 · 逻辑推理演示测验</h1>
    <p>这两套题目和答案已包含在公开源代码中，仅适合功能演示与自我练习，不能作为保密能力考试。
      两卷覆盖相同推理类别，但尚未完成题目等值、常模和信度验证；
      结果仅是当前答题证据，不能直接判断能力高低或证明能力增长。</p>

    <section className="assessment-form-list" aria-label="独立测验批次">
      {overview?.forms.map(form=><button type="button" key={form.code}
        className={"assessment-form-choice"+(active===form.code?" active":"")}
        onClick={()=>{if(!busy&&!loading)void refresh(form.code);}}
        disabled={busy||loading}>
        <strong>{form.title}</strong>
        <span>{statusText(form)}</span>
        <small>{form.attempted}/{form.total||6} 道已提交
          {form.status==="completed" && form.correct!==null?" · 答对 "+form.correct+" 道":""}</small>
      </button>)}
    </section>

    {overview?.measurementEvidence&&<section className="assessment-report"
      aria-label="测量证据等级与可信度">
      <h2>能力测量证据等级：{overview.measurementEvidence.evidenceGrade}</h2>
      <p><strong>{overview.measurementEvidence.evidenceGradeLabel}</strong>。
        已完成且具备可核验题目指纹的作答：
        {overview.measurementEvidence.verifiedCompletedItems} 题。</p>
      <p><strong>正式能力估计：暂不可提供。</strong> 无校准后的 θ、测量区间、人口百分位或综合能力总分。</p>
      <p><strong>可靠变化：证据不足。</strong> {overview.measurementEvidence.change.message}</p>
      <p className="progress-caveat">能力分与习惯打卡、对话、AI 判断及日常练习相互隔离。
        此处坚持仅展示能从当前测验记录得到的事实，不把不确定的变化显示成成长百分比。</p>
    </section>}

    {overview?.comparison&&<section className="assessment-report" aria-label="跨时段比较">
      <h2>两次测验 · 原始表现对照</h2>
      <p>A 卷 {overview.comparison.baselineCorrect}/{overview.comparison.total} 道，
        B 卷 {overview.comparison.retestCorrect}/{overview.comparison.total} 道；
        两次最后提交相隔约 {overview.comparison.daysApart} 天。</p>
      <p>正确率的算术差：{overview.comparison.rawDifferencePoints>0?"+":""}
        {overview.comparison.rawDifferencePoints} 个百分点。</p>
      <p>两次测验之间完成的独立训练：{overview.comparison.practiceAttemptsBetweenForms} 道。</p>
      <p className="progress-caveat">这是不同题卷的原始正确率差异，不能直接解读为能力提高或下降；
        还可能包含题目难度差异、猜测与测量误差。</p>
    </section>}

    {current&&(current.status==="ready"||current.status==="in_progress")&&task&&
      <section className="assess-question" aria-label="当前推理任务">
        <div className="assess-top"><span>{current.title}</span>
          <span>本卷已提交 {current.attempted}/{current.total} 道</span></div>
        <small>{skills[task.skillCode??""]??"逻辑推理"}</small>
        <h2>{task.prompt}</h2>
        <fieldset disabled={busy||submitted} className="assess-options">
          <legend className="visually-hidden">请选择一个答案</legend>
          {task.options.map(option=><label key={option.key} className="assess-option">
            <input type="radio" name="option" checked={selected===option.key}
              onChange={()=>setSelected(option.key)}/>
            <span><strong>{option.key}.</strong> {option.label}</span>
          </label>)}
        </fieldset>
        {!submitted?<button className="assess-button" onClick={submit} disabled={!selected||busy}>
          {busy?"提交中…":"提交并保存"}</button>:
          <button className="assess-button" onClick={()=>void refresh(active??undefined)} disabled={busy}>
            下一题 / 查看本卷结果
          </button>}
      </section>
    }
    {current?.status==="locked"&&<section className="assess-question">
      <h2>复测还未开放</h2>
      <p>{statusText(current)}。这段间隔有助于减少刚做过相同类型题目带来的短期练习效应，
        但单纯间隔 7 天并不能保证两卷具备相同难度。</p>
    </section>}
    {current?.status==="completed"&&<section className="assessment-report">
      <h2>{current.title} · 测验结果</h2>
      <p>答对 {current.correct}/{current.total} 道，完成于
        {current.completedAt?" "+new Date(current.completedAt).toLocaleString("zh-CN"):"未知时间"}。</p>
      <h3>分类证据</h3>
      <div className="assessment-dimensions">
        {current.dimensions.map(d=><div key={d.code}>
          <strong>{d.label}</strong><span>{d.correct}/{d.total} 道</span>
        </div>)}
      </div>
      <p className="progress-caveat">每种题型仅有 2 题，不能据此稳定判定某项能力强弱。这里记录的只是错误线索。</p>
      {current.legacyAttemptCount>0&&<p className="progress-caveat">
        本卷有 {current.legacyAttemptCount} 条较早的答题记录没有题目内容指纹；成绩仍保留，但无法追溯核验题目是否曾被同版本修改。
      </p>}
      {current.phase === "baseline" && current.integrityStatus === "verified" && (
        <p><a className="primary-link" href="/dashboard#assessment-records">根据初测制定训练习惯</a></p>
      )}
      <h3>逐题证据与解析</h3>
      {current.reviews.map((r,i)=><article className="assessment-review" key={r.taskId}>
        <strong>第 {i+1} 题 · {skills[r.skillCode??""]??"推理"} · {r.correct?"答对":"未答对"}</strong>
        <p>{r.prompt}</p>
        <p>你的选择：{r.selectedKey??"未记录"}；正确选项：{r.correctKey??"不可用"}</p>
        <p>{r.explanation}</p>
      </article>)}
    </section>}
    {current?.status==="unavailable"&&<p>题库尚未成功初始化，请先运行数据库迁移与种子命令。</p>}
    <p role="status" aria-live="polite">{message}</p>
    <p className="progress-caveat">本测验不自动修改“能力值”，不会根据习惯打卡给能力加分；
      分析只用于后续构建有独立复测证据的训练体系。</p>
  </main>;
}
