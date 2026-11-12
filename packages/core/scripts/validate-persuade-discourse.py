#!/usr/bin/env python3
"""Research-only PERSUADE 2.0 discourse-unit classifier, CC BY-NC-SA 4.0.

A small four-prompt pedagogical subset is sourced from a *third-party*
reproducible normalization of the official corpus, not the whole original.
No essay or annotation text goes to logs, app storage or an LLM API.
"""
import csv,gzip,hashlib,io,json,sys,urllib.request
from collections import Counter,defaultdict
import numpy as np
from scipy.sparse import csr_matrix,hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import SGDClassifier
from sklearn.metrics import f1_score,accuracy_score,precision_recall_fscore_support

COMMIT="6386a0de8d8f3f3bb3bfa7f3e0cc53ab7cc9dc3d"
OWNER="HakeoungLee/edis8100-datasets"
SOURCE={
 "essays.csv.gz":(4307611,"da9a77da36f467001442898f357c413aeb3a1215"),
 "discourse_elements.csv.gz":(4985952,"7a6fed4a48ad0b82d7310d3a0123b1c52ac9d3a1")
}
EXPECTED_ESSAYS=5531
EXPECTED_SEGMENTS=63211
CATEGORIES={"Lead","Position","Claim","Counterclaim","Rebuttal",
            "Evidence","Concluding Statement","Unannotated"}
LICENSE="CC BY-NC-SA 4.0 — NONCOMMERCIAL RESEARCH ONLY"
SEED=20261113

def verify_blob(data,size,blob):
    if len(data)!=size:raise ValueError("PERSUADE_SOURCE_BYTES_CHANGED")
    checksum=hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()
    if checksum!=blob:raise ValueError("PERSUADE_SOURCE_GIT_BLOB_CHANGED")
    return checksum

def load_source(name):
    if name not in SOURCE: raise ValueError("UNAPPROVED_SOURCE_NAME")
    size,sha=SOURCE[name]
    url="https://raw.githubusercontent.com/"+OWNER+"/"+COMMIT+"/persuade-4prompts/"+name
    request=urllib.request.Request(url,headers={"User-Agent":"StepMark-noncommercial-research/1.0"})
    with urllib.request.urlopen(request,timeout=90) as stream:compressed=stream.read(size+1)
    verify_blob(compressed,size,sha)
    return parse_csv_gzip(compressed)

def parse_csv_gzip(data):
    with gzip.GzipFile(fileobj=io.BytesIO(data)) as f:
        with io.TextIOWrapper(f,encoding="utf-8-sig",newline="") as text:
            rd=csv.DictReader(text)
            if not rd.fieldnames:raise ValueError("NO_CSV_HEADER")
            return list(rd)

def audited_data(essays,discourse,min_essays=EXPECTED_ESSAYS,min_segments=EXPECTED_SEGMENTS):
    if len(essays)!=min_essays or len(discourse)!=min_segments:
        raise ValueError("PERSUADE_ROW_COUNT_CHANGED")
    essay_cols={"essay_id","prompt_name","full_text"}
    discourse_cols={"essay_id","discourse_type","discourse_text"}
    if not all(essay_cols.issubset(r.keys()) for r in essays[:1]) or not all(discourse_cols.issubset(r.keys()) for r in discourse[:1]):
        raise ValueError("PERSUADE_SCHEMA_CHANGED")
    prompts={}
    groups={}
    for e in essays:
        eid=e["essay_id"]
        if not eid or eid in prompts:raise ValueError("DUPLICATE_ESSAY_ID")
        prompt=e["prompt_name"]
        if not prompt or not e["full_text"]:raise ValueError("MISSING_ESSAY_OR_PROMPT")
        prompts[eid]=prompt
        groups[eid]=hashlib.sha256(" ".join(e["full_text"].casefold().split()).encode()).hexdigest()
    result=[]; skipped=0
    for row in discourse:
        eid=row["essay_id"]
        label=row["discourse_type"]
        text=row["discourse_text"]
        if eid not in prompts:raise ValueError("ORPHAN_ANNOTATION")
        if label not in CATEGORIES:raise ValueError("UNKNOWN_DISCOURSE_LABEL")
        if not text or not text.strip():
            skipped+=1
            continue
        if len(text)>25000:raise ValueError("DISCOURSE_TEXT_TOO_LONG")
        result.append({"essay":eid,"group":groups[eid],"prompt":prompts[eid],
                       "text":text,"label":label,"tokens":len(text.split())})
    if skipped>int(len(discourse)*.05) or len(result)<min_segments*.90:
        raise ValueError("EXCESSIVE_MISSING_DISCOURSE_TEXT")
    if len(set(prompts.values()))!=4:
        raise ValueError("PROMPT_COUNT_CHANGED")
    return result,{"essays":len(essays),"annotations":len(discourse),
                   "eligibleSpans":len(result),"emptySpansExcluded":skipped,
                   "promptCount":len(set(prompts.values()))}

def split_by_essay(rows):
    tr=[];te=[]
    for r in rows:
        digest=hashlib.sha256(("discourse-split-v1:"+r["group"]).encode()).digest()
        (te if int.from_bytes(digest[:8],"big")%5==0 else tr).append(r)
    if set(x["essay"] for x in tr)&set(x["essay"] for x in te):
        raise ValueError("SAME_ESSAY_IN_BOTH_SETS")
    if set(x["group"] for x in tr)&set(x["group"] for x in te):
        raise ValueError("SAME_EXACT_TEXT_IN_BOTH_SETS")
    for name in set(x["prompt"] for x in rows):
        if sum(r["prompt"]==name for r in tr)<200 or sum(r["prompt"]==name for r in te)<60:
            raise ValueError("PROMPT_SPLIT_TOO_SMALL")
    return tr,te

def numeric_matrix(rows,prompts):
    idx={v:i for i,v in enumerate(prompts)}
    x=np.zeros((len(rows),len(prompts)+2),dtype=np.float32)
    for j,r in enumerate(rows):
        x[j,idx[r["prompt"]]]=1
        x[j,len(prompts)]=np.log1p(max(0,r["tokens"]))
        x[j,len(prompts)+1]=np.log1p(len(r["text"]))
    return csr_matrix(x)

def cluster_accuracy_ci(truth,base,pred,essay_ids,seed=SEED):
    d=defaultdict(list)
    for i,essay in enumerate(essay_ids):
        d[essay].append(int(pred[i]==truth[i])-int(base[i]==truth[i]))
    persons=np.asarray([np.mean(v) for v in d.values()])
    if len(persons)<30:return None
    rng=np.random.default_rng(seed)
    sample=np.asarray([persons[rng.integers(0,len(persons),size=len(persons))].mean() for _ in range(1200)])
    return [round(float(v),6) for v in np.quantile(sample,[.025,.975])]

def evaluate(rows,quality):
    train,test=split_by_essay(rows)
    label_set=sorted(CATEGORIES)
    prompts=sorted(set(r["prompt"] for r in rows))
    most=Counter(r["label"] for r in train).most_common(1)[0][0]
    top={}
    for p in prompts:
        counts=Counter(r["label"] for r in train if r["prompt"]==p)
        top[p]=counts.most_common(1)[0][0] if counts else most
    baseline=np.asarray([top[r["prompt"]] for r in test])
    y=np.asarray([r["label"] for r in train]);truth=np.asarray([r["label"] for r in test])
    xt=numeric_matrix(train,prompts);xs=numeric_matrix(test,prompts)
    length=SGDClassifier(loss="log_loss",alpha=.0001,random_state=17,max_iter=800,tol=1e-3)
    length.fit(xt,y);lp=length.predict(xs)
    tfidf=TfidfVectorizer(ngram_range=(1,2),min_df=6,max_features=18000,
                          strip_accents="unicode",sublinear_tf=True,dtype=np.float32)
    a=tfidf.fit_transform([r["text"] for r in train])
    b=tfidf.transform([r["text"] for r in test])
    if a.shape[1]<100:raise ValueError("TEXT_VOCAB_TOO_SMALL")
    classifier=SGDClassifier(loss="log_loss",alpha=.00003,random_state=17,max_iter=1200,tol=1e-3)
    classifier.fit(hstack([xt,a]).tocsr(),y)
    prediction=classifier.predict(hstack([xs,b]).tocsr())
    candidates={"prompt_majority":baseline,"prompt_length":lp,"tfidf_plus_length":prediction}
    def metrics(p):
        return {"accuracy":round(float(accuracy_score(truth,p)),6),
                "macroF1":round(float(f1_score(truth,p,labels=label_set,average="macro",zero_division=0)),6),
                "weightedF1":round(float(f1_score(truth,p,labels=label_set,average="weighted",zero_division=0)),6)}
    result={name:metrics(pred) for name,pred in candidates.items()}
    direct=cluster_accuracy_ci(truth,baseline,prediction,[r["essay"] for r in test])
    essay_delta=defaultdict(list)
    for i,r in enumerate(test):
        essay_delta[r["essay"]].append(int(prediction[i]==truth[i])-int(lp[i]==truth[i]))
    text_vs_length={"spanWeightedAccuracyGain":round(float(
        accuracy_score(truth,prediction)-accuracy_score(truth,lp)),6),
        "essayEqualMeanAccuracyGain":round(float(np.mean(
          [np.mean(d) for d in essay_delta.values()])),6),
        "essayClusterBootstrap95":cluster_accuracy_ci(
          truth,lp,prediction,[r["essay"] for r in test])}
    labels=[]
    precision,recall,f1,support=precision_recall_fscore_support(truth,prediction,labels=label_set,zero_division=0)
    for i,name in enumerate(label_set):
        labels.append({"type":name,"support":int(support[i]),
                       "precision":round(float(precision[i]),5),
                       "recall":round(float(recall[i]),5),"F1":round(float(f1[i]),5)})
    byprompt=[]
    for p in prompts:
        idx=[i for i,r in enumerate(test) if r["prompt"]==p]
        byprompt.append({"prompt":p,"spans":len(idx),
                         "majorityMacroF1":round(float(f1_score(truth[idx],baseline[idx],labels=label_set,average="macro",zero_division=0)),6),
                         "modelMacroF1":round(float(f1_score(truth[idx],prediction[idx],labels=label_set,average="macro",zero_division=0)),6)})
    return {"status":"PERSUADE2_NONCOMMERCIAL_ARGUMENT_RESEARCH","license":LICENSE,
      "source":{"publisher":"Crossley et al. 2024 PERSUADE 2.0","thirdPartySubset":OWNER,
                "commit":COMMIT,"verifiedCompressedGitBlobs":True,"promptsSubset":4},
      "quality":{**quality,"trainSpans":len(train),"testSpans":len(test),
                 "testEssays":len(set(r["essay"] for r in test)),
                 "textVocabularySize":len(tfidf.vocabulary_),"noEssayOverlap":True},
      "models":result,"accuracyGainVsPromptMajorityCluster95":direct,
      "directTextVsLength":text_vs_length,
      "perLabel":labels,"byPrompt":byprompt,
      "individualDataPersisted":False,
      "limitations":"Four-prompt academic subset; no commercial use. Discourse-unit classification on human-annotated English school essays, not overall writing quality, not Chinese speaking ability, not independent new-prompt generalization. Essay-cluster CI exploratory, and training text may share phrases across essays."}

def main():
    essays=load_source("essays.csv.gz")
    annotations=load_source("discourse_elements.csv.gz")
    rows,quality=audited_data(essays,annotations)
    print(json.dumps(evaluate(rows,quality),ensure_ascii=False,indent=2))

if __name__=="__main__":
    try:main()
    except Exception as ex:
        print("PERSUADE2 research failed:",type(ex).__name__,str(ex),file=sys.stderr)
        raise SystemExit(1)
