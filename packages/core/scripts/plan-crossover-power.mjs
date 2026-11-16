import {simulateCrossoverPlanning} from "../src/research-crossover-power.ts";
if(process.argv.length!==3||process.argv[2]!=="--synthetic-only")
  throw new Error("Usage: --synthetic-only");
const cases=[];
for(const itemsPerForm of [6,18]){
  for(const assignedParticipants of [160,320,640,960]){
    cases.push(simulateCrossoverPlanning({
      assignedParticipants,itemsPerForm,formLogitShift:.25,
      secondSessionLogitShift:.2,dropoutAB:.15,dropoutBA:.15,
      replicates:250,seed:20261117
    }));
  }
}
process.stdout.write(JSON.stringify({
  status:"SYNTHETIC_PLANNING_ONLY",design:"balanced A_B vs B_A; no research participants",
  preregisteredAssumptionExample:{formLogitShift:.25,secondSessionLogitShift:.2,
    independentMissingness:true,dropout:.15,seed:20261117},
  scenarios:cases,
  warning:"Do not treat these as empirical StepMark effect sizes or automatic minimum N. Effects, reliability, omitted covariates, attrition mechanism, cross-form dimensionality, multiple testing and external replication need study-specific justification."
},null,2)+"\n");
