export interface SingleChoiceTask {
  options: readonly {key:string;label:string}[];
  correctKey:string;
}
export interface ChoiceEvaluation {isCorrect:boolean;taskScore:0|100;scorerVersion:"single-choice-v1"}
/** Deterministic binary task score. Does NOT estimate population ability. */
export function evaluateSingleChoice(task:SingleChoiceTask,selectedKey:string):ChoiceEvaluation {
  const keys=task.options.map(x=>x.key);
  if(keys.length<2 || new Set(keys).size!==keys.length || !keys.includes(task.correctKey)){
    throw new RangeError("invalid task definition");
  }
  if(!keys.includes(selectedKey))throw new RangeError("selected key not among options");
  const isCorrect=selectedKey===task.correctKey;
  return {isCorrect,taskScore:isCorrect?100:0,scorerVersion:"single-choice-v1"};
}
