import {createHash} from "node:crypto";
import {fitHabitCurve,habitCurve} from "../src/habit.ts";
import {fitTrend,predictTrend} from "../src/trend-benchmarks.ts";
import {pathToFileURL} from "node:url";
import {pairedRmseBootstrap,auditRecordedMissingness} from "../src/research-audit.ts";

/**
 * Edgren et al. 2025: actual 0..4 SRBAI longitudinal data describing
 * habit DECAY, not formation. All source records remain in the isolated CI
 * runner; only group-level error summaries are logged.
 */
const PROJECT="sngu4",NAME="SRBAI_TS_141223.csv";
const EXPECTED="a18c12c2d4208e6d5aa43f0e7f32617bfe92efffdb3016b1cbfa3f091fb36808";
const GROUPS=["SED","SNA","ALC","TOB"];
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
function summary(byPersonErrors){
  if(!byPersonErrors.length)return {rmse:null,mae:null,participants:0};
  let mse=0,mae=0;
  for(const errors of byPersonErrors){
    mse+=mean(errors.map(e=>e*e));
    mae+=mean(errors.map(Math.abs));
  }
  return {rmse:+Math.sqrt(mse/byPersonErrors.length).toFixed(6),
    mae:+(mae/byPersonErrors.length).toFixed(6),
    participants:byPersonErrors.length};
}
export function parseDecayCsv(content){
  const lines=content.trim().split(/\r?\n/);
  if(lines.shift()?.trim()!=="respid,BEHAV,StudyDay,SRBAI,StudyDay_new")
    throw new Error("SCHEMA_MISMATCH");
  const people=new Map(),groups=new Map(GROUPS.map(g=>[g,new Set()]));
  let observed=0,missing=0;
  for(const line of lines){
    if(!line.trim())continue;
    const cells=line.split(",");
    if(cells.length!==5)throw new Error("ROW_SHAPE");
    const [rawId,group,dayText,scoreText,newDayText]=cells;
    if(!/^\d{6}$/.test(rawId)||!GROUPS.includes(group))
      throw new Error("SUBJECT_OR_GROUP_INVALID");
    const day=Number(dayText),rescaled=Number(newDayText);
    if(!Number.isInteger(day)||day<7||day>91||rescaled!==day-7)
      throw new Error("DAY_MISMATCH");
    let score=null;
    if(scoreText==="NA"||scoreText===""){missing++;}
    else {
      const raw=Number(scoreText);
      if(!Number.isFinite(raw)||raw<0||raw>4)throw new Error("INVALID_SRBAI");
      score=25*raw;observed++;
    }
    const pseudo="p_"+createHash("sha256").update(group+":"+rawId).digest("hex").slice(0,24);
    const history=people.get(pseudo)??{group,rows:[]};
    if(history.group!==group)throw new Error("GROUP_CONFLICT");
    history.rows.push({day:rescaled,automaticity:score});
    people.set(pseudo,history);
    groups.get(group).add(pseudo);
    if(lines.length>20000)throw new Error("OVERSIZE");
  }
  return {people,byGroup:groups,rows:observed+missing,observed,missing};
}
export function compareDecay(parsed){
  const results=[];
  for(const group of GROUPS){
    const profiles=[...parsed.people.values()].filter(x=>x.group===group);
    const last=[],linear=[],decay=[],matched=[];
    let holdout=0;
    const decayPairs=[];
    for(const profile of profiles){
      const sorted=[...profile.rows].sort((a,b)=>a.day-b.day);
      for(let i=1;i<sorted.length;i++){
        if(sorted[i].day===sorted[i-1].day)throw new Error("DUPLICATE_DAY");
      }
      const valid=sorted.filter(x=>x.automaticity!==null);
      if(valid.length<10)continue;
      const n=Math.floor(valid.length*.7);
      const train=valid.slice(0,n),test=valid.slice(n);
      if(train.length<6||test.length<3)continue;
      holdout+=test.length;
      const latest=train[train.length-1].automaticity;
      const lastErrors=test.map(x=>latest-x.automaticity);
      last.push(lastErrors);
      const fit=fitTrend(train.map(x=>({effectiveRepetitions:x.day,automaticity:x.automaticity})),"linear");
      if(fit)linear.push(test.map(x=>predictTrend(x.day,fit)-x.automaticity));
      // Invert automaticity to fit decreasing curves without forcing an
      // inappropriate increasing formation curve on the original score.
      const curve=fitHabitCurve(train.map(x=>({
        effectiveRepetitions:x.day,automaticity:100-x.automaticity
      })));
      if(curve){
        decay.push(test.map(x=>100-habitCurve(x.day,curve.parameters)-x.automaticity));
        matched.push(lastErrors);
        decayPairs.push({baseline:lastErrors,candidate:test.map(x=>100-habitCurve(x.day,curve.parameters)-x.automaticity)});
      }
    }
    const gPeople=parsed.byGroup.get(group).size;
    results.push({group,participants:gPeople,
      records:profiles.reduce((s,p)=>s+p.rows.length,0),
      observedRatings:profiles.reduce((s,p)=>s+p.rows.filter(x=>x.automaticity!==null).length,0),
      predictedHoldoutRecords:holdout,
      models:{lastObservation:summary(last),linearTime:summary(linear),
        exponentialDecay:summary(decay),matchedLastForDecay:summary(matched),
        pairedDecay:pairedRmseBootstrap(decayPairs),
        recordedMissingness:auditRecordedMissingness(profiles.flatMap((p,i)=>p.rows.map(row=>({participantId:String(i),day:row.day,automaticity:row.automaticity}))))}});
  }
  return {status:"REAL_LONGITUDINAL_DECAY_RESEARCH",
    source:"Edgren et al. (2025), https://osf.io/sngu4/",
    sampleRows:parsed.rows,people:parsed.people.size,
    observed:parsed.observed,missing:parsed.missing,
    groups:results,
    caution:"Study concerns diminishing health-risk habits, not forming positive routines. Time is day index, NOT number of repetitions. Comparisons are predictive checks, not causal claims or proof of StepMark maintenance policy."};
}
async function fetchStudy(){
  const list=await fetch("https://api.osf.io/v2/nodes/"+PROJECT+"/files/osfstorage/",{
    signal:AbortSignal.timeout(13000)});
  if(!list.ok)throw new Error("OSF_LIST_HTTP_"+list.status);
  const d=await list.json();
  const item=d.data?.find(x=>x.attributes?.name===NAME);
  if(!item)throw new Error("SOURCE_MISSING");
  const url=new URL(item.links.download);
  if(url.protocol!=="https:"||!["osf.io","files.osf.io"].includes(url.hostname))
    throw new Error("INVALID_SOURCE");
  const res=await fetch(url,{signal:AbortSignal.timeout(40000)});
  if(!res.ok)throw new Error("OSF_FILE_HTTP_"+res.status);
  const data=Buffer.from(await res.arrayBuffer());
  if(data.length>1_000_000)throw new Error("FILE_TOO_LARGE");
  const checksum=createHash("sha256").update(data).digest("hex");
  if(checksum!==EXPECTED)throw new Error("DATA_SOURCE_CHANGED");
  return data.toString("utf8");
}
async function main(){
  const text=await fetchStudy();
  const result=compareDecay(parseDecayCsv(text));
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(e=>{process.stderr.write("Edgren validation failed: "+e.message+"\n");process.exitCode=1;});
