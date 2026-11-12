import importlib.util
from pathlib import Path
import unittest
import numpy as np
script=Path(__file__).with_name("validate-asap-writing.py")
spec=importlib.util.spec_from_file_location("asap",script)
asap=importlib.util.module_from_spec(spec);spec.loader.exec_module(asap)

def fixtures(n=500):
    data=[]
    for i in range(n):
        s="topic-a" if i%2 else "topic-b"
        text="An argument based on evidence and ideas " + ("reason "* (20+i%20)) + " case"+str(i)
        data.append({"essay_id":str(i),"score":str(1+i%6),"prompt_name":s,"full_text":text})
    return data

class WritingResearch(unittest.TestCase):
    def test_github_sha_rejects_unpinned_source(self):
        with self.assertRaisesRegex(ValueError,"SIZE_CHANGED"):
            asap.verify_source(b"fake_zip")
    def test_bad_score_and_duplicate_essay_refused(self):
        d=fixtures(500)
        d[0]["score"]="9"
        with self.assertRaisesRegex(ValueError,"SCORE_RANGE_CHANGED"):
            asap.validate_rows(d,min_rows=1)
        d=fixtures(500)
        d.append(dict(d[0]))
        with self.assertRaisesRegex(ValueError,"DUPLICATE"):
            asap.validate_rows(d,min_rows=1)
    def test_exact_text_duplicates_never_cross_split(self):
        data=asap.validate_rows(fixtures(1000),min_rows=1)
        data.append(dict(data[0]))
        a,b=asap.split(data)
        self.assertEqual(len(a)+len(b),len(data))
        self.assertFalse(set(row["hash"] for row in a)&set(row["hash"] for row in b))
    def test_matched_bootstrap(self):
        a=asap.paired_ci(np.ones(100),np.zeros(100))
        self.assertEqual(a,[1.0,1.0])
        self.assertEqual(asap.paired_ci(np.zeros(100),np.ones(100)),[-1.0,-1.0])
        self.assertIsNone(asap.paired_ci([1],[0]))
    def test_training_and_holdout_are_both_nonempty(self):
        data=asap.validate_rows(fixtures(1000),min_rows=1)
        tr,te=asap.split(data)
        self.assertGreater(len(tr),len(te))
        self.assertGreater(len(te),100)

if __name__=="__main__":
    unittest.main()
