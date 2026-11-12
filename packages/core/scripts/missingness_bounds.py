"""Conservative finite-sample bounds for missing bounded outcomes.

Research diagnostic ONLY. Does not estimate a causal treatment effect, handle
sampling error, or assume MAR/MNAR mechanisms. A complete-case mean is retained
only for comparison with the all-assigned worst/best-case range.
"""
from __future__ import annotations
from math import isfinite

def _check(x:float|None, minimum:float,maximum:float)->float|None:
    if x is None:return None
    if not isinstance(x,(int,float)) or not isfinite(x) or x<minimum or x>maximum:
        raise ValueError("OUT_OF_SCALE")
    return float(x)

def bounded_change_summary(
    pairs:list[tuple[float|None,float|None]],
    minimum:float=0,maximum:float=4
)->dict:
    """Average (end-baseline) across ALL assigned persons: identification bounds.

    Bounds are algebraic extrema given only the score support. Missing baseline,
    missing endpoint, and both missing are treated separately. No imputation
    assumptions. Data should be fed as (baseline, end) tuples.
    """
    if not isfinite(minimum) or not isfinite(maximum) or maximum<=minimum:
        raise ValueError("INVALID_SUPPORT")
    if not pairs or len(pairs)>50000:raise ValueError("INVALID_SAMPLE")
    lower=upper=complete_sum=0.0
    complete=baseline_missing=end_missing=0
    for pair in pairs:
        if not isinstance(pair,(tuple,list)) or len(pair)!=2:
            raise ValueError("INVALID_PAIR")
        first,last=_check(pair[0],minimum,maximum),_check(pair[1],minimum,maximum)
        if first is None:baseline_missing+=1
        if last is None:end_missing+=1
        low_baseline=first if first is not None else maximum
        high_baseline=first if first is not None else minimum
        low_end=last if last is not None else minimum
        high_end=last if last is not None else maximum
        lower+=low_end-low_baseline
        upper+=high_end-high_baseline
        if first is not None and last is not None:
            complete+=1;complete_sum+=last-first
    n=len(pairs)
    return {
        "assigned":n,"completePairs":complete,"baselineMissing":baseline_missing,
        "endMissing":end_missing,
        "meanChangeBounds":[round(lower/n,6),round(upper/n,6)],
        "completeCaseMeanChange":round(complete_sum/complete,6) if complete else None,
        "identificationRangeWidth":round((upper-lower)/n,6),
        "allAssignedDirectionIdentified":("increase" if lower>0 else
                                         "decrease" if upper<0 else "unresolved")
    }

def contrast_to_reference(group:dict,reference:dict)->dict:
    """Arithmetic difference in group mean changes; not a causal effect."""
    a,b=group["meanChangeBounds"],reference["meanChangeBounds"]
    lo=round(a[0]-b[1],6)
    hi=round(a[1]-b[0],6)
    return {"differenceInChangeBounds":[lo,hi],
      "allAssignedSignIdentified":"positive" if lo>0 else "negative" if hi<0 else "unresolved",
      "warning":"Identification interval for group change contrast, not a confidence interval or an adjusted randomized treatment estimate."}
