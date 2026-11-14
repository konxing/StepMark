/**
 * Research-only sensitivity audit for self-reported habit opportunities.
 *
 * Identification bounds describe all completions of the recorded unknown
 * values, not sampling confidence intervals, prediction intervals, or habit
 * formation probabilities. Missing calendar days are not recorded events.
 * Use only independently confirmed user observations; AI proposals are excluded.
 */
export interface AdherenceCounts {
  performedEligible:number;
  missedEligible:number;
  eligibleButPerformanceUnknown:number;
  eligibilityUnknown:number;
}
export interface AdherenceSensitivityAudit {
  version:"adherence-sensitivity-v1";
  observedEligibleOutcomes:number;
  knownEligibleOpportunities:number;
  unknownEligibility:number;
  /** Fraction of known eligible occasions with observed behavior. */
  knownEligibleOutcomeCoverage:number|null;
  /** Complete-case observed rate; can be selection-biased. */
  observedAdherence:number|null;
  /**
   * All possible adherence rates across already-confirmed eligible events
   * when eligible-but-unobserved behavior may be positive or negative.
   */
  knownEligibleIdentificationBounds:Readonly<{low:number;high:number}>|null;
  /**
   * Wider, deliberately conservative bounds when unknown eligibility could
   * correspond to a further eligible success or failure.
   * Not sharp when behavior on unknown-eligibility events is already known.
   */
  recordedEventConservativeBounds:Readonly<{low:number;high:number}>|null;
  status:"no_recorded_potential_opportunity"|"unresolved"|"observed_known_eligibility";
  note:string;
}
function validCount(value:unknown):value is number {
  return typeof value==="number" && Number.isSafeInteger(value) && value>=0 && value<=10000;
}
const round=(x:number)=>Number(x.toFixed(6));
export function auditAdherenceSensitivity(c:Readonly<AdherenceCounts>):AdherenceSensitivityAudit {
  if(!c||!validCount(c.performedEligible)||!validCount(c.missedEligible)||
     !validCount(c.eligibleButPerformanceUnknown)||!validCount(c.eligibilityUnknown))
    throw new RangeError("invalid recorded opportunity counts");
  const observed=c.performedEligible+c.missedEligible;
  const eligible=observed+c.eligibleButPerformanceUnknown;
  const all=eligible+c.eligibilityUnknown;
  if(all>10000)throw new RangeError("too many recorded opportunities");
  const bounds=(denominator:number,unknown:number)=>denominator===0?null:{
    low:round(c.performedEligible/denominator),
    high:round((c.performedEligible+unknown)/denominator)
  };
  return {
    version:"adherence-sensitivity-v1",
    observedEligibleOutcomes:observed,knownEligibleOpportunities:eligible,
    unknownEligibility:c.eligibilityUnknown,
    knownEligibleOutcomeCoverage:eligible?round(observed/eligible):null,
    observedAdherence:observed?round(c.performedEligible/observed):null,
    knownEligibleIdentificationBounds:bounds(eligible,c.eligibleButPerformanceUnknown),
    recordedEventConservativeBounds:bounds(all,c.eligibleButPerformanceUnknown+c.eligibilityUnknown),
    status:all===0?"no_recorded_potential_opportunity":
      c.eligibleButPerformanceUnknown>0||c.eligibilityUnknown>0?"unresolved":"observed_known_eligibility",
    note:"Research-only identification bounds over recorded confirmed evidence. These are not statistical confidence intervals. Unrecorded days, individual dependence, selection bias and a possibly unknown total number of opportunities remain unquantified. No habit-formation probability or ability score is implied."
  };
}
