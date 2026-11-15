/** Offline deterministic research demonstration. No network, DB, or subject data. */
import {generateOracleIRT,benchmarkOracle2PL} from "../src/research-psychometrics.ts";
const design=[
  {key:"sim-easy",difficulty:-1,discrimination:0.9},
  {key:"sim-medium",difficulty:0,discrimination:1.5},
  {key:"sim-hard",difficulty:1,discrimination:2.2}
];
const result=benchmarkOracle2PL(generateOracleIRT(20261115,3200,design),design);
// JSON contains only aggregate simulation diagnostics. Never print individual trials.
console.log(JSON.stringify({researchOnly:true,model:"synthetic_oracle_irt_2pl",result},null,2));
