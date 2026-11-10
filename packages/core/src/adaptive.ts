import {irt2plProbability} from "./measurement.ts";

/** Must be externally calibrated and versioned. Raw difficulty guesses are forbidden. */
export interface CalibratedItem {
  id: string;
  calibrationStatus: "validated";
  calibrationVersion: string;
  discrimination: number;
  difficulty: number;
  contentArea: string;
  expectedSeconds: number;
  /** Global exposure frequency measured over comparable opportunities, not raw views. */
  exposureRate: number;
}
export interface CalibratedAnswer {
  item: CalibratedItem;
  correct: boolean;
}
export interface AbilityPosterior {
  status: "model_based";
  theta: number;
  standardError: number;
  variance: number;
  evidenceCount: number;
  calibrationVersion: string;
  /** Fixed-grid discrete approximation of a N(0,1) prior and 2PL likelihood. */
  grid: readonly number[];
  weights: readonly number[];
}
function itemGuard(item: CalibratedItem): void {
  if (!item || item.calibrationStatus !== "validated" ||
      typeof item.id !== "string" || !item.id || item.id.length > 128 ||
      typeof item.calibrationVersion !== "string" || !item.calibrationVersion ||
      typeof item.contentArea !== "string" || !item.contentArea ||
      !Number.isFinite(item.discrimination) || item.discrimination <= 0 ||
      !Number.isFinite(item.difficulty) || Math.abs(item.difficulty) > 8 ||
      !Number.isFinite(item.expectedSeconds) || item.expectedSeconds < 1 ||
      !Number.isFinite(item.exposureRate) || item.exposureRate < 0 || item.exposureRate > 1) {
    throw new RangeError("item requires validated calibration and bounded parameters");
  }
}
/**
 * EAP via fixed 161-point quadrature in [-4,4], log-sum-exp for numerical safety.
 * Prior N(0,1), theta scale requires linking and measurement invariance.
 * Numbers are *only* interpretable after calibration on an appropriate sample.
 */
export function estimateThetaEap(answers: readonly CalibratedAnswer[], calibrationVersion: string): AbilityPosterior {
  if (!calibrationVersion || answers.length > 200) throw new RangeError("invalid calibration version or answer count");
  const seen = new Set<string>();
  for (const answer of answers) {
    itemGuard(answer.item);
    if (typeof answer.correct !== "boolean" || answer.item.calibrationVersion !== calibrationVersion ||
        seen.has(answer.item.id)) throw new RangeError("duplicate, invalid or unlinked item");
    seen.add(answer.item.id);
  }
  const grid = Array.from({length:161},(_,i) => -4 + i * 0.05);
  const logWeights = grid.map(theta => {
    let logp = -0.5 * theta * theta;
    for (const a of answers) {
      const p = irt2plProbability(theta, a.item.discrimination, a.item.difficulty);
      logp += a.correct ? Math.log(Math.max(p, 1e-300)) : Math.log(Math.max(1-p, 1e-300));
    }
    return logp;
  });
  const max = Math.max(...logWeights);
  const raw = logWeights.map(l => Math.exp(l-max));
  const denom = raw.reduce((a,b)=>a+b,0);
  const weights = raw.map(w => w/denom);
  const theta = grid.reduce((a,t,i)=>a+t*weights[i]!,0);
  const variance = grid.reduce((a,t,i)=>a+(t-theta)**2*weights[i]!,0);
  return {status:"model_based",theta,variance,standardError:Math.sqrt(variance),
    evidenceCount:answers.length,calibrationVersion,grid,weights};
}
function conditionalVariance(posterior:AbilityPosterior, item:CalibratedItem, correct:boolean):number {
  const post = posterior.grid.map((theta,i) => {
    const p = irt2plProbability(theta,item.discrimination,item.difficulty);
    return posterior.weights[i]! * (correct ? p : 1-p);
  });
  const mass = post.reduce((a,b)=>a+b,0);
  if (mass < 1e-15) return posterior.variance;
  const mean = post.reduce((a,v,i)=>a+v*posterior.grid[i]!,0)/mass;
  return post.reduce((a,v,i)=>a+v*(posterior.grid[i]!-mean)**2,0)/mass;
}
/**
 * Expected reduction in posterior variance for next item divided by expected
 * response time (seconds). This is a prospective design, not a proven SLA.
 */
export function selectNextCalibratedItem(input:{
  answers:readonly CalibratedAnswer[];
  candidates:readonly CalibratedItem[];
  calibrationVersion:string;
  maxExposureRate?:number;
  completedByContent?:Readonly<Record<string,number>>;
  targetShare?:Readonly<Record<string,number>>;
  minItems?:number;
  targetStandardError?:number;
}):null|{itemId:string; expectedVarianceReduction:number; informationPerSecond:number; currentStandardError:number} {
  const {candidates,answers,calibrationVersion} = input;
  if (candidates.length > 2000) throw new RangeError("candidate pool too large");
  const posterior = estimateThetaEap(answers,calibrationVersion);
  const minItems=input.minItems??3, targetSE=input.targetStandardError??0.35;
  const maxExposure=input.maxExposureRate??1;
  if (!Number.isInteger(minItems) || minItems < 1 || minItems > 200 ||
      !Number.isFinite(targetSE) || targetSE <= 0 ||
      !Number.isFinite(maxExposure) || maxExposure < 0 || maxExposure > 1) {
    throw new RangeError("invalid adaptive controls");
  }
  if (answers.length >= minItems && posterior.standardError <= targetSE) return null;
  const used=new Set(answers.map(a=>a.item.id));
  const filtered=candidates.filter(item=>{
    itemGuard(item);
    if (item.calibrationVersion!==calibrationVersion)throw new RangeError("item calibration version mismatch");
    return !used.has(item.id) && item.exposureRate <= maxExposure;
  });
  if (!filtered.length) return null;
  let allowed=filtered;
  const targets=input.targetShare;
  if (targets) {
    const shares=Object.entries(targets);
    if (!shares.length || shares.some(([k,v])=>!k || !Number.isFinite(v) || v<0 || v>1) ||
        Math.abs(shares.reduce((s,[,v])=>s+v,0)-1)>1e-6) {
      throw new RangeError("target shares must sum to one");
    }
    const completed=input.completedByContent??{};
    if (Object.values(completed).some(v=>!Number.isSafeInteger(v)||v<0))throw new RangeError("invalid content counts");
    const total=Object.values(completed).reduce((a,b)=>a+b,0);
    const deficits=new Map(shares.map(([k,v])=>[k, v*(total+1)-(completed[k]??0)]));
    const maxDeficit=Math.max(...filtered.map(x=>deficits.get(x.contentArea)??-Infinity));
    if (Number.isFinite(maxDeficit) && maxDeficit > 0) {
      allowed=filtered.filter(x=>(deficits.get(x.contentArea)??-Infinity)>=maxDeficit-1e-9);
    }
  }
  let best:null|{itemId:string; expectedVarianceReduction:number; informationPerSecond:number; currentStandardError:number}=null;
  for(const item of allowed){
    const p=posterior.grid.reduce((s,theta,i)=>s+posterior.weights[i]!*
      irt2plProbability(theta,item.discrimination,item.difficulty),0);
    const expectedRemaining = p*conditionalVariance(posterior,item,true) +
      (1-p)*conditionalVariance(posterior,item,false);
    const delta=Math.max(0,posterior.variance-expectedRemaining);
    const utility=delta/item.expectedSeconds;
    if(!best || utility > best.informationPerSecond + 1e-15 ||
      (Math.abs(utility-best.informationPerSecond)<1e-15 && item.id < best.itemId)){
      best={itemId:item.id,expectedVarianceReduction:delta,informationPerSecond:utility,
        currentStandardError:posterior.standardError};
    }
  }
  return best;
}
