import importlib.util
from pathlib import Path
import unittest
import numpy as np

p=Path(__file__).with_name("validate-persuade-rare.py")
spec=importlib.util.spec_from_file_location("persuade_rare",p)
rare=importlib.util.module_from_spec(spec)
spec.loader.exec_module(rare)

def records(n=120):
    rows=[]
    for p in range(4):
        for i in range(n):
            key=f"{p}-{i}"
            for label in ("Counterclaim","Rebuttal","Evidence"):
                rows.append({"prompt":f"prompt-{p}","essay":key,
                    "group":key,"label":label,
                    "text":f"{label} this text describes something about evidence and reasoning {i}",
                    "tokens":13})
    return rows

class RareLabels(unittest.TestCase):
    def test_essay_disjoint_outer_folds(self):
        folds=list(rare.prompt_folds(records()))
        self.assertEqual(len(folds),4)
        for held,train,test in folds:
            self.assertTrue(all(x["prompt"]!=held for x in train))
            self.assertTrue(all(x["prompt"]==held for x in test))
            self.assertFalse({x["essay"] for x in train}&{x["essay"] for x in test})
        self.assertEqual(sum(len(test) for _,_,test in folds),len(records()))
    def test_reject_same_text_in_different_prompts(self):
        rows=records()
        rows[0]["group"]=rows[-1]["group"]
        with self.assertRaisesRegex(ValueError,"SAME_ESSAY_IN_TWO_PROMPTS"):
            list(rare.prompt_folds(rows))
    def test_class_weights_training_only_and_clipped(self):
        weights=rare.train_only_weights(np.array(
            ["Evidence"]*100+["Claim"]*20+["Rebuttal"]*5
        ))
        self.assertGreater(weights["Rebuttal"],weights["Evidence"])
        self.assertLessEqual(max(weights.values()),3)
        self.assertGreaterEqual(min(weights.values()),.5)
    def test_rare_per_class_metrics_not_only_accuracy(self):
        truth=["Claim"]*4+["Rebuttal"]*2+["Counterclaim"]*2
        pred=["Claim"]*6+["Counterclaim"]*2
        stats=rare.full_metrics(truth,pred)
        self.assertEqual(stats["byLabel"]["Rebuttal"]["recall"],0)
        self.assertEqual(stats["byLabel"]["Counterclaim"]["support"],2)
        self.assertLess(stats["macroF1"],.5)
    def test_unknown_variant_refused_without_data_fitting(self):
        with self.assertRaisesRegex(ValueError,"INVALID_PRESPECIFIED_VARIANT"):
            rare.fit_predict([],[],"tuned_on_test")

if __name__=="__main__":
    unittest.main()
