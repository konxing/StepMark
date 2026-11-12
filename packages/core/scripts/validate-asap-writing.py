#!/usr/bin/env python3
"""ASAP2 researcher-only human rating benchmark; no individual records logged."""
import csv, hashlib, io, json, re, sys, urllib.request, zipfile
from collections import Counter
import numpy as np
from scipy.sparse import csr_matrix, hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import Ridge

UPSTREAM="060ab225ca0984c0bf43ff222bf6bb2bc6195b6f"
FILE="ASAP_2_Final_github_train.zip"
URL="https://raw.githubusercontent.com/scrosseye/ASAP_2.0/"+UPSTREAM+"/"+FILE
BLOB_SHA="a6d7534bfd6733f056b571b0c459280e31430c45"
BYTES=11240696
NEED={"essay_id","score","full_text","prompt_name"}
WORDS=re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")

def verify_source(data):
    if len(data)!=BYTES:
        raise ValueError("ASAP_SOURCE_SIZE_CHANGED")
    git_sha=hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()
    if git_sha!=BLOB_SHA:
        raise ValueError("ASAP_SOURCE_GIT_HASH_CHANGED")
    return git_sha

def read_essays(data,min_rows=10000):
    verify_source(data)
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        files=[m for m in z.infolist() if m.filename.lower().endswith(".csv")]
        # The publisher archive also contains a 288-byte macOS sidecar CSV.
        # Select its unique substantive CSV rather than parsing the sidecar.
        actual=[m for m in files if 1_000_000<=m.file_size<=110_000_000
                and not any(part.startswith("._") for part in m.filename.split("/"))]
        if len(actual)!=1:
            raise ValueError("ASAP_ZIP_LAYOUT_CHANGED substantive_csv_count="+str(len(actual))+
                             " sizes="+str([m.file_size for m in files]))
        with z.open(actual[0]) as f:
            rd=csv.DictReader(io.TextIOWrapper(f,encoding="utf-8-sig",newline=""))
            if not rd.fieldnames or not NEED.issubset(rd.fieldnames):
                raise ValueError("ASAP_HEADER_CHANGED")
            return validate_rows(list(rd),min_rows=min_rows)

def validate_rows(raw,min_rows=10000):
    if len(raw)<min_rows or len(raw)>30000:
        raise ValueError("ASAP_ROW_COUNT_CHANGED")
    ids=set(); rows=[]
    for r in raw:
        if not NEED.issubset(r):
            raise ValueError("ASAP_HEADER_CHANGED")
        essay_id=r["essay_id"].strip()
        prompt=r["prompt_name"].strip()
        text=r["full_text"]
        if not essay_id or len(essay_id)>120 or essay_id in ids:
            raise ValueError("ASAP_DUPLICATE_OR_BAD_ID")
        if not prompt or not text or not 5<=len(text)<=35000:
            raise ValueError("ASAP_BAD_TEXT")
        try: score=float(r["score"])
        except (ValueError,TypeError): raise ValueError("ASAP_BAD_SCORE") from None
        if not np.isfinite(score) or not 1<=score<=6:
            raise ValueError("ASAP_SCORE_RANGE_CHANGED")
        n=len(WORDS.findall(text))
        if not n: raise ValueError("ASAP_UNSCORABLE_TEXT")
        ids.add(essay_id)
        group=hashlib.sha256(" ".join(text.casefold().split()).encode()).hexdigest()
        rows.append({"prompt":prompt,"text":text,"score":score,"words":n,"hash":group})
    if len({r["prompt"] for r in rows})<2:
        raise ValueError("ASAP_MULTIPLE_PROMPTS_REQUIRED")
    return rows

def split(rows,min_per_prompt=15):
    train=[];test=[]
    for r in rows:
        h=hashlib.sha256(("split:"+r["hash"]).encode()).digest()
        (test if int.from_bytes(h[:8],"big")%5==0 else train).append(r)
    if set(r["hash"] for r in train)&set(r["hash"] for r in test):
        raise ValueError("DUPLICATE_TEXT_LEAK")
    tr=Counter(r["prompt"] for r in train);te=Counter(r["prompt"] for r in test)
    if any(tr[k]<50 or te[k]<min_per_prompt for k in tr|te):
        raise ValueError("INSUFFICIENT_PROMPT_TRAIN_OR_HOLDOUT")
    return train,test

def length_matrix(rows,names):
    columns={name:i for i,name in enumerate(names)}
    x=np.zeros((len(rows),2+len(names)),dtype=np.float32)
    for i,r in enumerate(rows):
        x[i,0]=np.log1p(r["words"])
        x[i,1]=np.log1p(len(r["text"]))
        x[i,2+columns[r["prompt"]]]=1
    return csr_matrix(x)

def paired_ci(baseline,candidate,seed=20261113):
    if len(baseline)!=len(candidate):raise ValueError("UNMATCHED_ERROR")
    if len(baseline)<30:return None
    error=np.asarray(baseline)-np.asarray(candidate)
    rng=np.random.default_rng(seed)
    boot=[]
    for i in range(1200):
        ids=rng.integers(0,len(error),size=len(error))
        boot.append(float(error[ids].mean()))
    return [round(float(v),6) for v in np.quantile(boot,[.025,.975])]

def evaluate(rows):
    tr,te=split(rows)
    names=sorted(set(r["prompt"] for r in tr))
    if set(names)!=set(r["prompt"] for r in te): raise ValueError("UNKNOWN_TEST_PROMPT")
    y=np.asarray([r["score"] for r in tr]);truth=np.asarray([r["score"] for r in te])
    means={p:float(np.mean([r["score"] for r in tr if r["prompt"]==p])) for p in names}
    baseline=np.asarray([means[r["prompt"]] for r in te])
    xtr=length_matrix(tr,names);xte=length_matrix(te,names)
    lm=Ridge(alpha=50.0,solver="lsqr").fit(xtr,y)
    length=lm.predict(xte)
    vector=TfidfVectorizer(ngram_range=(1,2),min_df=5,max_df=.98,max_features=12000,
                           strip_accents="unicode",sublinear_tf=True,dtype=np.float32)
    bow_tr=vector.fit_transform([r["text"] for r in tr])
    bow_te=vector.transform([r["text"] for r in te])
    if bow_tr.shape[1]<100:raise ValueError("VOCAB_TOO_SMALL")
    model=Ridge(alpha=30.0,solver="lsqr").fit(hstack([xtr,bow_tr]).tocsr(),y)
    text_pred=model.predict(hstack([xte,bow_te]).tocsr())
    predictions={"prompt_mean":baseline,"length_ridge":length,"tfidf_ridge":text_pred}
    predictions={k:np.clip(v,1,6) for k,v in predictions.items()}
    errors={k:np.abs(v-truth) for k,v in predictions.items()}
    def metrics(k):
        e=errors[k]
        return {"mae":round(float(e.mean()),6),
                "rmse":round(float(np.sqrt(np.mean((predictions[k]-truth)**2))),6),
                "maeImprovementVsPromptMean":round(float((errors["prompt_mean"]-e).mean()),6),
                "pairedBootstrap95":None if k=="prompt_mean" else paired_ci(errors["prompt_mean"],e)}
    per_prompt=[]
    for p in names:
        ix=np.asarray([i for i,r in enumerate(te) if r["prompt"]==p])
        per_prompt.append({"prompt":p,"n":len(ix),
            "baselineMAE":round(float(errors["prompt_mean"][ix].mean()),6),
            "lengthMAE":round(float(errors["length_ridge"][ix].mean()),6),
            "tfidfMAE":round(float(errors["tfidf_ridge"][ix].mean()),6)})
    counts=np.asarray([r["words"] for r in te])
    bounds=np.quantile(counts,[1/3,2/3])
    bands={"short":counts<=bounds[0],
           "medium":(counts>bounds[0])&(counts<=bounds[1]),
           "long":counts>bounds[1]}
    length_results=[{"band":k,"n":int(mask.sum()),
            "baselineMAE":round(float(errors["prompt_mean"][mask].mean()),6),
            "tfidfMAE":round(float(errors["tfidf_ridge"][mask].mean()),6)}
            for k,mask in bands.items() if mask.sum()>=30]
    return {"status":"ASAP2_HUMAN_WRITING_RESEARCH",
      "source":{"dataset":"ASAP 2.0 publisher train only","commit":UPSTREAM,
                "gitBlobSha1":BLOB_SHA,"license":"CC BY 4.0"},
      "sample":{"essays":len(rows),"training":len(tr),"heldout":len(te),"prompts":len(names),
                "scoreMin":min(r["score"] for r in rows),"scoreMax":max(r["score"] for r in rows),
                "vocabularySize":len(vector.vocabulary_),"verifiedNoExactTextLeakage":True},
      "overall":{k:metrics(k) for k in predictions},
      "directTextVsLength":{"maeImprovement":round(float(
          (errors["length_ridge"]-errors["tfidf_ridge"]).mean()),6),
          "pairedBootstrap95":paired_ci(errors["length_ridge"],errors["tfidf_ridge"]),
          "interpretation":"Exploratory paired essay-level comparison of text features beyond prompt and length."},
      "byPrompt":per_prompt,"byLengthTertile":length_results,
      "rowsOrEssayTextPersisted":False,
      "limits":"Only official TRAIN subset, not official blind test. TF-IDF Ridge is offline ML, not an LLM judge. English adolescent essays are not Chinese spoken-expression ability; do not reuse this output as personal score."}

def main():
    request=urllib.request.Request(URL,headers={"User-Agent":"StepMark-ephemeral-research/1.0"})
    with urllib.request.urlopen(request,timeout=100) as stream:
        data=stream.read(BYTES+1)
    rows=read_essays(data)
    print(json.dumps(evaluate(rows),ensure_ascii=False,indent=2))

if __name__=="__main__":
    try:main()
    except Exception as e:
        print("ASAP2 research error:",type(e).__name__,str(e),file=sys.stderr)
        raise SystemExit(1)
