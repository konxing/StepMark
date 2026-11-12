import importlib.util
from pathlib import Path
import unittest
import numpy as np
p=Path(__file__).with_name("validate-persuade-discourse.py")
spec=importlib.util.spec_from_file_location("persuade",p)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def fixture(n=120):
    essays=[];ann=[]
    labels=sorted(m.CATEGORIES)
    for i in range(n):
        essay_id=str(i)
        prompt="prompt-"+str(i%4)
        essays.append({"essay_id":essay_id,"prompt_name":prompt,
                       "full_text":"This essay has individual argument "+str(i)})
        for j in range(5):
            ann.append({"essay_id":essay_id,"discourse_type":labels[(i+j)%len(labels)],
                        "discourse_text":"A claim with supporting evidence "+str(j)})
    return essays,ann

class DiscourseResearch(unittest.TestCase):
    def test_check_noncommercial_pinned_input(self):
        with self.assertRaisesRegex(ValueError,"BYTES_CHANGED"):
            m.verify_blob(b"bad",100,"nothing")
    def test_source_mapping_rejects_unknown_annotation(self):
        e,d=fixture()
        d[0]["discourse_type"]="made up"
        with self.assertRaisesRegex(ValueError,"UNKNOWN_DISCOURSE_LABEL"):
            m.audited_data(e,d,min_essays=120,min_segments=600)
    def test_split_is_essay_grouped(self):
        e,d=fixture(500)
        r,q=m.audited_data(e,d,min_essays=500,min_segments=2500)
        a,b=m.split_by_essay(r)
        self.assertTrue(a and b)
        self.assertFalse(set(x["essay"] for x in a)&set(x["essay"] for x in b))
        self.assertEqual(len(a)+len(b),2500)
        self.assertEqual(q["promptCount"],4)
    def test_confidence_interval_has_correct_direction(self):
        ids=[str(i) for i in range(100)]
        truth=np.array(["Claim"]*100)
        baseline=np.array(["Evidence"]*100)
        good=np.array(["Claim"]*100)
        self.assertEqual(m.cluster_accuracy_ci(truth,baseline,good,ids),[1.0,1.0])
        self.assertEqual(m.cluster_accuracy_ci(truth,good,baseline,ids),[-1.0,-1.0])

if __name__=="__main__":unittest.main()
