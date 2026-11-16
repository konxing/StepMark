#!/usr/bin/env python3
"""Research-only prospective held-out *binary response* benchmark for Dataverse ICAR SAPA.

Uses anonymous ID/item/resp ONLY; never saves respondent-level files in Git.
Trains MML 1PL and 2PL item parameters with Gaussian quadrature + EM, then
tests held-out respondents' held-out items conditioned on their other responses.
Calibrated items are ICAR items, NOT StepMark's original logic A/B items.
"""
import csv
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

SOURCE = {
    "source": "Condon & Revelle (2016), ICAR SAPA, Harvard Dataverse doi:10.7910/DVN/AD9RVY V3",
    "file_sha256": "27b22368434e94278d4cfee238770339f8e90da6229ef9ffd95900c4972426e5",
    "file_bytes": 18796756,
    "data_use": "offline research only; scored responses, no item stems or answer keys",
    "expected_items": 60,
}
GRID = np.linspace(-4, 4, 41)
LOG_PRIOR = -0.5 * GRID * GRID
LOG_PRIOR -= np.log(np.exp(LOG_PRIOR - LOG_PRIOR.max()).sum()) + LOG_PRIOR.max()


def stable_number(value):
    return int.from_bytes(hashlib.sha256(value.encode("utf-8")).digest()[:8], "big")


def read_verified_data(path, expected=SOURCE):
    """Strictly verify shape, binary responses, duplicate keys, and size.

    A one-in-eight *respondent* hash subsample keeps memory and computation
    bounded. All original rows are counted and all subject IDs checked.
    """
    people = {}
    counts = Counter()
    subjects = set()
    items = set()
    seen_selected = set()
    with open(path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        if reader.fieldnames != ["id", "item", "resp"]:
            raise ValueError("IRW_SCHEMA_CHANGED")
        for row in reader:
            if None in row or len(row) != 3:
                raise ValueError("INVALID_ROW_SHAPE")
            pid, item, resp = row["id"], row["item"], row["resp"]
            if not pid or not item or len(pid) > 128 or len(item) > 128 or resp not in ("0", "1"):
                raise ValueError("INVALID_ID_ITEM_OR_BINARY_RESPONSE")
            counts["rows"] += 1
            if counts["rows"] > expected["expected_rows"]:
                raise ValueError("IRW_ROWS_EXCEEDED_PIN")
            subjects.add(pid)
            items.add(item)
            if stable_number("sample:" + pid) % 8 != 0:
                continue
            key = (pid, item)
            if key in seen_selected:
                raise ValueError("DUPLICATE_RESPONDENT_ITEM")
            seen_selected.add(key)
            answers = people.setdefault(pid, {})
            answers[item] = int(resp)
    if (counts["rows"] != expected["expected_rows"]
        or len(subjects) != expected["expected_respondents"]
        or len(items) != expected["expected_items"]):
        raise ValueError("IRW_SOURCE_COUNTS_OR_VERSION_CHANGED")
    if len(people) < 1000:
        raise ValueError("SUBSAMPLE_TOO_SMALL")
    item_names = sorted(items)
    pos = {item: i for i, item in enumerate(item_names)}
    train, holdout = [], []
    heldout_ids = []
    for pid in sorted(people):
        v = np.full(len(item_names), np.nan)
        for item, response in people[pid].items():
            v[pos[item]] = response
        if stable_number("group:" + pid) % 4 == 0:
            holdout.append(v)
            heldout_ids.append(pid)
        else:
            train.append(v)
    if len(train) < 500 or len(holdout) < 200:
        raise ValueError("IRW_SPLIT_TOO_SMALL")
    return np.array(train), np.array(holdout), heldout_ids, {
        "sourceRows": counts["rows"],
        "sourceRespondents": len(subjects),
        "sourceItems": len(items),
        "trainingRespondents": len(train),
        "heldoutRespondents": len(holdout),
    }, item_names


def read_dataverse_scored(path):
    """Read source-authenticated *wide* scored ICAR responses without identifiers.

    SHA is rechecked even when a CSV was generated or copied independently.
    A deterministic row-index subsample is reproducible because the CSV bytes
    are pinned. Original demography, verbatim answers and extra columns are
    discarded, never logged, and never used for AI training.
    """
    source_path=Path(path)
    if source_path.stat().st_size != SOURCE["file_bytes"]:
        raise ValueError("DATAVERSE_BYTES_MISMATCH")
    digest=hashlib.sha256()
    with source_path.open("rb") as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b""):
            digest.update(chunk)
    if digest.hexdigest()!=SOURCE["file_sha256"]:
        raise ValueError("DATAVERSE_SHA256_MISMATCH")
    with source_path.open(newline="",encoding="utf-8-sig") as fh:
        reader=csv.DictReader(fh)
        if reader.fieldnames is None:
            raise ValueError("DATAVERSE_HEADER_MISSING")
        import re
        # Publisher's names LN / MR / VR / R3D are cognitive item prefixes.
        names=[x for x in reader.fieldnames if re.fullmatch(r"(?:LN|MR|VR|R3D)[A-Za-z0-9_.-]*",x)]
        if len(names)!=60 or len(names)!=len(set(names)):
            raise ValueError("DATAVERSE_ICAR_60_ITEM_SCHEMA_CHANGED")
        mapping={item:idx for idx,item in enumerate(sorted(names))}
        train,holdout,ids=[],[],[]
        n=0
        scored=0
        included=0
        for row in reader:
            if None in row or len(row)!=len(reader.fieldnames):
                raise ValueError("DATAVERSE_CSV_ROW_INVALID")
            n+=1
            if n>105000:
                raise ValueError("DATAVERSE_UNEXPECTED_N")
            pid=str(n) # Row position, NOT respondent personal identifier
            in_sample=stable_number("sample:"+pid)%8==0
            values=np.full(len(names),np.nan) if in_sample else None
            answered=0
            for item in names:
                value=row[item]
                if value in ("","NA","NaN","NULL"):
                    continue
                if value not in ("0","1","0.0","1.0"):
                    raise ValueError("DATAVERSE_RESPONSE_NOT_BINARY")
                answered+=1
                scored+=1
                if in_sample:
                    values[mapping[item]]=float(value)
            if in_sample and answered>0:
                included+=1
                if stable_number("group:"+pid)%4==0:
                    holdout.append(values)
                    ids.append(pid)
                else:
                    train.append(values)
    if not (94000<=n<=105000) or scored<1000000 or included<1000:
        raise ValueError("DATAVERSE_COHORT_UNEXPECTED")
    if len(train)<500 or len(holdout)<200:
        raise ValueError("DATAVERSE_SPLIT_TOO_SMALL")
    return np.asarray(train),np.asarray(holdout),ids,{
        "sourceRows":n,"sourceScoredResponses":scored,"sourceItems":60,
        "sampledRespondentsWithResponses":included,
        "trainingRespondents":len(train),"heldoutRespondents":len(holdout)
    },sorted(names)


def softmax_rows(log_weights):
    shifted = log_weights - log_weights.max(axis=1, keepdims=True)
    weights = np.exp(shifted)
    return weights / weights.sum(axis=1, keepdims=True)


def posterior_for(matrix, a, c):
    """Posterior over ability grid for respondent's already observed answers."""
    observed = (~np.isnan(matrix)).astype(float)
    successes = np.nan_to_num(matrix, nan=0.0)
    eta = GRID[:, None] * a[None, :] + c[None, :]
    log_success = -np.logaddexp(0.0, -eta)
    log_failure = -np.logaddexp(0.0, eta)
    ll = successes @ log_success.T + (observed - successes) @ log_failure.T
    return softmax_rows(ll + LOG_PRIOR[None, :])


def fit_mml(matrix, two_pl, max_em=18):
    """Regularized quadrature marginal maximum likelihood; research comparator.

    Prior theta~N(0,1) fixes identification; per-item weak ridge regularization
    and bounded optimization make sparse-response fitting finite. This is NOT
    population norming, test equating, or calibrated StepMark item metadata.
    """
    n, n_items = matrix.shape
    observed = (~np.isnan(matrix)).astype(float)
    successes = np.nan_to_num(matrix, nan=0.0)
    observed_item = observed.sum(axis=0)
    if np.any(observed_item < 20):
        raise ValueError("SPARSE_ITEM_UNIDENTIFIED")
    p = np.clip((successes.sum(axis=0) + 1) / (observed_item + 2), 0.05, 0.95)
    a = np.ones(n_items)
    c = np.log(p / (1-p))
    converged = False
    for itr in range(max_em):
        post = posterior_for(matrix, a, c)
        counts = observed.T @ post
        hits = successes.T @ post
        new_a, new_c = a.copy(), c.copy()
        for j in range(n_items):
            nj, sj = counts[j], hits[j]
            def neg(x):
                aj = float(x[0]) if two_pl else 1.0
                cj = float(x[-1])
                z = aj * GRID + cj
                logp = -np.logaddexp(0, -z)
                log1p = -np.logaddexp(0, z)
                pv = np.exp(logp)
                regularizer = (aj-1)**2/(2*.8**2) + cj*cj/32
                value = -(sj @ logp + (nj-sj) @ log1p) + regularizer
                diff = sj - nj*pv
                gradc = -diff.sum() + cj/16
                if two_pl:
                    grada = -(diff @ GRID) + (aj-1)/(.8**2)
                    return value, np.array([grada,gradc])
                return value, np.array([gradc])
            start = [a[j],c[j]] if two_pl else [c[j]]
            bounds = [(0.25,3.5),(-7,7)] if two_pl else [(-7,7)]
            fit = minimize(neg, start, jac=True, method="L-BFGS-B",
                           bounds=bounds, options={"maxiter":35,"ftol":1e-8})
            if not np.all(np.isfinite(fit.x)):
                raise ValueError("IRT_FIT_NONFINITE")
            new_a[j] = fit.x[0] if two_pl else 1
            new_c[j] = fit.x[-1]
        shift = max(float(np.max(np.abs(new_a-a))), float(np.max(np.abs(new_c-c))))
        a, c = new_a, new_c
        if shift < 0.005:
            converged = True
            break
    return a,c,{"iterations":itr+1,"toleranceReached":converged,
               "minDiscrimination":round(float(a.min()),4),
               "maxDiscrimination":round(float(a.max()),4)}


def brier(pred, actual):
    return float(np.mean((pred-actual)**2))


def logloss(pred, actual):
    pp = np.clip(pred, 1e-7, 1-1e-7)
    return float(np.mean(-actual*np.log(pp)-(1-actual)*np.log1p(-pp)))


def confidence_interval(differences, seed=20261113, draws=1500):
    if len(differences) < 10:
        return None
    values = np.asarray(differences, dtype=float)
    rng = np.random.default_rng(seed)
    draws_index = rng.integers(0, len(values), size=(draws,len(values)))
    boot = np.mean(values[draws_index], axis=1)
    return [round(float(x),6) for x in np.quantile(boot,[.025,.975])]


TARGET_PARTITIONS = ("item-holdout", "item-holdout-robust-a", "item-holdout-robust-b")

def item_family(name):
    # Four published ICAR task families; an unexpected name remains OTHER
    # rather than being silently pooled into a known construct.
    for family in ("R3D", "LN", "MR", "VR"):
        if name.startswith(family):
            return family
    return "OTHER"


def evaluate_models(train, holdout, heldout_ids, names, fitted, target_seed="item-holdout"):
    if target_seed not in TARGET_PARTITIONS:
        raise ValueError("TARGET_PARTITION_NOT_PRESPECIFIED")
    train_mask = np.isfinite(train)
    counts = train_mask.sum(axis=0)
    rates = np.clip((np.nan_to_num(train,nan=0).sum(axis=0)+1)/(counts+2),1e-6,1-1e-6)
    # One person contributes one aggregate; don't inflate precision with
    # many responses from the same individual.
    per_person = {"item_rate":[],"1PL":[],"2PL":[]}
    log_person = {key:[] for key in per_person}
    target_answers = 0
    # Each respondent contributes at most one family-specific aggregate.
    family_losses = {}
    if len(holdout) != len(heldout_ids):
        raise ValueError("HOLDOUT_ID_COUNT_MISMATCH")
    for row, pid in zip(holdout, heldout_ids):
        available = np.flatnonzero(np.isfinite(row))
        if len(available) < 4:
            continue
        # Held-out items are chosen using a deterministic item hash independent
        # of outcomes. All model posteriors see context items only.
        ranked = sorted(available,key=lambda col: stable_number(target_seed+":"+pid+":"+names[col]))
        num_targets = max(1,round(len(ranked)*.25))
        targets = np.asarray(ranked[:num_targets],dtype=int)
        contexts = np.asarray(ranked[num_targets:],dtype=int)
        if len(contexts) < 3:
            continue
        truth = row[targets]
        context_row = np.full_like(row,np.nan)
        context_row[contexts] = row[contexts]
        per_person["item_rate"].append(brier(rates[targets],truth))
        log_person["item_rate"].append(logloss(rates[targets],truth))
        for key in ("1PL","2PL"):
            a,c = fitted[key]
            posterior = posterior_for(context_row[None,:],a,c)[0]
            z = GRID[:,None]*a[targets][None,:]+c[targets][None,:]
            prob = 1/(1+np.exp(-np.clip(z,-40,40)))
            prediction = posterior @ prob
            per_person[key].append(brier(prediction,truth))
            log_person[key].append(logloss(prediction,truth))
        # Reuse the exact same target outcomes for all three comparators.
        # Family contrasts are diagnostic only (substantially lower N).
        for family in sorted(set(item_family(names[i]) for i in targets)):
            positions=np.array([k for k,i in enumerate(targets) if item_family(names[i])==family])
            y=truth[positions]
            baseline_brier=brier(rates[targets[positions]],y)
            family_a=posterior_for(context_row[None,:],*fitted["1PL"])[0]
            family_b=posterior_for(context_row[None,:],*fitted["2PL"])[0]
            fam_losses={}
            for label,post in (("1PL",family_a),("2PL",family_b)):
                a,c=fitted[label]
                indexes=targets[positions]
                prob=1/(1+np.exp(-np.clip(GRID[:,None]*a[indexes][None,:]+c[indexes][None,:],-40,40)))
                fam_losses[label]=brier(post @ prob,y)
            bucket=family_losses.setdefault(family,{"item_rate":[],"1PL":[],"2PL":[],"targets":0})
            bucket["item_rate"].append(baseline_brier)
            bucket["1PL"].append(fam_losses["1PL"])
            bucket["2PL"].append(fam_losses["2PL"])
            bucket["targets"]+=len(positions)
        target_answers += len(targets)
    if len(per_person["item_rate"]) < 100:
        raise ValueError("HELDOUT_WITH_CONTEXT_TOO_SMALL")
    def result_for(key):
        losses = np.array(per_person[key])
        base = np.array(per_person["item_rate"])
        return {"personMeanBrier":round(float(losses.mean()),6),
                "personMeanLogLoss":round(float(np.mean(log_person[key])),6),
                "brierImprovementVsItemRate":round(float((base-losses).mean()),6),
                "brierImprovementCi95":confidence_interval(base-losses)}
    direct = np.array(per_person["1PL"]) - np.array(per_person["2PL"])
    # A matched *direct* 2PL-vs-1PL comparison is more informative than
    # looking only at two separate confidence intervals against baseline.
    comparison={"brierImprovement2plVs1pl":round(float(direct.mean()),6),
                "bootstrap95":confidence_interval(direct),
                "interpretation":"Positive means 2PL predicts better; uncertainty is participant-clustered and exploratory."}
    families={}
    for family,loss in sorted(family_losses.items()):
        base=np.array(loss["item_rate"])
        first=np.array(loss["1PL"])
        second=np.array(loss["2PL"])
        d=first-second
        families[family]={
            "respondentsWithFamilyTargets":len(base),
            "targetResponses":loss["targets"],
            "itemRateBrier":round(float(base.mean()),6),
            "onePlBrier":round(float(first.mean()),6),
            "twoPlBrier":round(float(second.mean()),6),
            "twoPlMinusOnePlImprovement":round(float(d.mean()),6),
            "pairedBootstrap95":confidence_interval(d) if len(base)>=30 else None}
    return {"targetPartition":target_seed,
            "testedRespondents":len(per_person["item_rate"]),
            "heldoutItemResponses":target_answers,
            "itemFamilyDiagnostics":families,
            "directModelComparison":comparison,
            "results":{key:result_for(key) for key in ("item_rate","1PL","2PL")},
            "note":"Held-out respondents and within-person target items; descriptive predictive benchmark, not StepMark item calibration."}


def audit_target_partition_robustness(train,holdout,ids,names,fitted):
    # Same training/held-out respondents and same fitted item parameters.
    # Only which of each held-out respondent's answered items is hidden changes.
    results=[evaluate_models(train,holdout,ids,names,fitted,target_seed=seed)
             for seed in TARGET_PARTITIONS]
    effects=[r["directModelComparison"]["brierImprovement2plVs1pl"] for r in results]
    return {
        "design":"fixed-trained-model alternative target partitions; NOT repeated model calibration or independent replication",
        "prespecifiedSeeds":list(TARGET_PARTITIONS),
        "targetPartitions":[{
            "partition":r["targetPartition"],
            "testedRespondents":r["testedRespondents"],
            "targetResponses":r["heldoutItemResponses"],
            "deltaBrier2plVs1pl":r["directModelComparison"]["brierImprovement2plVs1pl"],
            "paired95":r["directModelComparison"]["bootstrap95"],
            "familyDiagnostics":r["itemFamilyDiagnostics"]
        } for r in results],
        "directionPositiveInPartitions":sum(effect>0 for effect in effects),
        "deltaBrierRange":[min(effects),max(effects)],
        "warning":"These target partitions share people, fitted parameters and source cohort. Correlated exploratory sensitivity checks are not independent replication, and each unadjusted family interval can be unstable. No favorable partition may be selected for product model tuning."
    }


def run(path):
    train, holdout, ids, quality, names = read_dataverse_scored(path)
    fitted = {}
    fit_diag = {}
    for label, flag in (("1PL",False),("2PL",True)):
        a,c,info=fit_mml(train,flag)
        fitted[label]=(a,c)
        fit_diag[label]=info
    performance=evaluate_models(train,holdout,ids,names,fitted)
    robustness=audit_target_partition_robustness(train,holdout,ids,names,fitted)
    return {"status":"EXTERNAL_ICAR_RESEARCH_BENCHMARK",
            "source":SOURCE,
            "quality":quality,
            "fitDiagnostics":fit_diag,
            "holdout":performance,
            "targetPartitionRobustness":robustness,
            "participantLevelDataPersisted":False,
            "calibratesStepMarkOriginalItems":False,
            "caution":"Exploratory 1PL/2PL MML comparison on a convenience internet sample. Item stems and keys are separately licensed. No fairness, measurement-invariance, or ability growth claim."}


if __name__ == "__main__":
    if len(sys.argv)!=2:
        raise SystemExit("Usage: validate-icar.py <verified Harvard Dataverse scored ICAR CSV>")
    try:
        output=run(Path(sys.argv[1]))
        print(json.dumps(output,indent=2,ensure_ascii=False))
    except Exception as exc:
        # No raw respondent rows/IDs are logged on error.
        print("ICAR research benchmark failed:",type(exc).__name__,str(exc),file=sys.stderr)
        raise SystemExit(1)
