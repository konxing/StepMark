#!/usr/bin/env python3
"""Academic NONCOMMERCIAL robustness benchmark: unseen PERSUADE 2.0 prompts.

Prespecified ordinary, clipped sqrt-balanced and fully balanced SGD models.
Evaluates all four leave-one-prompt-out folds; NEVER picks a winner using the
held-out answers. Human annotation spans are discarded after evaluation.
Not a deployable argumentation or Chinese-expression scorer.
"""
import importlib.util
import json
import math
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from scipy.sparse import csr_matrix, hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import SGDClassifier
from sklearn.metrics import accuracy_score, f1_score, precision_recall_fscore_support

path=Path(__file__).with_name("validate-persuade-discourse.py")
spec=importlib.util.spec_from_file_location("persuade_source",path)
source=importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)

TARGET_CLASSES=("Counterclaim","Rebuttal")
SEED=17

def prompt_folds(rows):
    prompts=sorted({r["prompt"] for r in rows})
    if len(prompts)!=4:
        raise ValueError("EXACTLY_FOUR_PROMPTS_REQUIRED")
    # The same normalized full essay must not cross prompt boundaries.
    group_to_prompt={}
    for row in rows:
        group=row["group"]; prompt=row["prompt"]
        if group in group_to_prompt and group_to_prompt[group]!=prompt:
            raise ValueError("SAME_ESSAY_IN_TWO_PROMPTS")
        group_to_prompt[group]=prompt
    for p in prompts:
        train=[r for r in rows if r["prompt"]!=p]
        test=[r for r in rows if r["prompt"]==p]
        if len(test)<100 or len(train)<300:
            raise ValueError("PROMPT_FOLD_TOO_SMALL")
        if set(r["essay"] for r in train)&set(r["essay"] for r in test):
            raise ValueError("ESSAY_LEAKAGE")
        if set(r["group"] for r in train)&set(r["group"] for r in test):
            raise ValueError("NEAR_DUPLICATE_LEAKAGE")
        yield p,train,test

def numeric_features(rows):
    # Prompt identity is intentionally NOT a feature in an unseen-prompt test.
    x=np.zeros((len(rows),2),dtype=np.float32)
    for i,r in enumerate(rows):
        x[i,0]=np.log1p(r["tokens"])
        x[i,1]=np.log1p(len(r["text"]))
    return csr_matrix(x)

def train_only_weights(y):
    counts=Counter(y)
    n=len(y); k=len(counts)
    if not all(counts.values()):
        raise ValueError("EMPTY_CLASS")
    # Fixed in advance: dampens inverse-frequency weights and caps extremes.
    return {name:min(3.0,max(.5,math.sqrt(n/(k*count))))
            for name,count in counts.items()}

def fit_predict(train,test,variant):
    allowed={"unweighted","sqrt_capped","balanced"}
    if variant not in allowed:
        raise ValueError("INVALID_PRESPECIFIED_VARIANT")
    y=np.asarray([r["label"] for r in train])
    if set(source.CATEGORIES)-set(y):
        raise ValueError("TRAIN_FOLD_MISSING_CLASS")
    vectorizer=TfidfVectorizer(
        ngram_range=(1,2),min_df=6,max_features=18000,
        strip_accents="unicode",sublinear_tf=True,dtype=np.float32
    )
    xt=vectorizer.fit_transform([r["text"] for r in train])
    xv=vectorizer.transform([r["text"] for r in test])
    if xt.shape[1]<100:raise ValueError("VOCABULARY_TOO_SMALL")
    a=hstack([numeric_features(train),xt]).tocsr()
    b=hstack([numeric_features(test),xv]).tocsr()
    weights=(None if variant=="unweighted" else
             "balanced" if variant=="balanced" else train_only_weights(y))
    model=SGDClassifier(
        loss="log_loss",alpha=.00003,random_state=SEED,max_iter=1200,
        tol=1e-3,class_weight=weights
    )
    model.fit(a,y)
    return model.predict(b)

def full_metrics(truth,pred):
    classes=sorted(source.CATEGORIES)
    prec,rec,f1,support=precision_recall_fscore_support(
        truth,pred,labels=classes,zero_division=0
    )
    by_label={name:{"support":int(support[i]),
                    "precision":round(float(prec[i]),6),
                    "recall":round(float(rec[i]),6),
                    "f1":round(float(f1[i]),6)}
              for i,name in enumerate(classes)}
    return {"accuracy":round(float(accuracy_score(truth,pred)),6),
            "macroF1":round(float(f1_score(truth,pred,labels=classes,
                                          average="macro",zero_division=0)),6),
            "rareLabelMeanRecall":round(float(np.mean(
                [by_label[name]["recall"] for name in TARGET_CLASSES])),6),
            "rareLabelMeanPrecision":round(float(np.mean(
                [by_label[name]["precision"] for name in TARGET_CLASSES])),6),
            "byLabel":by_label}

def evaluate(rows,quality):
    variants=("unweighted","sqrt_capped","balanced")
    pooled={v:{"truth":[],"prediction":[]} for v in variants}
    folds=[]
    for prompt,train,test in prompt_folds(rows):
        truth=[r["label"] for r in test]
        item={"heldoutPrompt":prompt,"trainSpans":len(train),
              "testSpans":len(test),"testEssays":len({r["essay"] for r in test}),
              "models":{}}
        for name in variants:
            prediction=fit_predict(train,test,name)
            item["models"][name]=full_metrics(truth,prediction)
            pooled[name]["truth"].extend(truth)
            pooled[name]["prediction"].extend(prediction)
        folds.append(item)
    aggregate={v:full_metrics(pooled[v]["truth"],pooled[v]["prediction"])
               for v in variants}
    # Transparent, prespecified screening rules, not a validation verdict.
    checks={}
    for name,stats in aggregate.items():
        fragile=[k for k in TARGET_CLASSES if
                 stats["byLabel"][k]["precision"]<.5 or
                 stats["byLabel"][k]["recall"]<.5]
        checks[name]={"rareLabelPrecisionAndRecallOverHalf":not fragile,
                      "lowPerformingRareLabels":fragile}
    return {
      "status":"PERSUADE2_RARE_LABEL_LOPO_RESEARCH",
      "license":source.LICENSE,
      "source":{"subset":source.OWNER,"commit":source.COMMIT,
                "verifiedInputGitBlobSha1":True},
      "quality":{"essays":quality["essays"],
                 "eligibleSpans":len(rows),
                 "outerPromptFolds":len(folds),
                 "allSpansEvaluatedExactlyOnce":True},
      "preRegisteredVariants":list(variants),
      "pooled":aggregate,
      "folds":folds,
      "diagnosticGuards":checks,
      "conclusionBoundaries":"All four prompts were previously public; this is exploratory leave-one-topic-out validation, NOT an untouched future cohort. Class weights are derived solely from the other three prompts. The study cannot authorize commercial reuse or a Chinese personal-expression score. Do NOT choose a model on the basis of these outer-fold scores and then claim independent replication."
    }

def main():
    essays=source.load_source("essays.csv.gz")
    annotations=source.load_source("discourse_elements.csv.gz")
    rows,quality=source.audited_data(essays,annotations)
    print(json.dumps(evaluate(rows,quality),ensure_ascii=False,indent=2))

if __name__=="__main__":
    try: main()
    except Exception as ex:
        print("PERSUADE rare-label research failed:",type(ex).__name__,str(ex),file=sys.stderr)
        raise SystemExit(1)
