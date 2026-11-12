import unittest
from missingness_bounds import bounded_change_summary,contrast_to_reference

class BoundedMissingOutcomeTests(unittest.TestCase):
 def test_complete_data_collapses_to_point(self):
  x=bounded_change_summary([(2,1),(3,4)])
  self.assertEqual(x["meanChangeBounds"],[0,0])
  self.assertEqual(x["completePairs"],2)
  self.assertEqual(x["identificationRangeWidth"],0)
 def test_end_missing_and_baseline_missing_have_separate_extrema(self):
  x=bounded_change_summary([(2,None),(None,1),(None,None)])
  self.assertEqual(x["meanChangeBounds"],[-3.0,3.666667])
  self.assertEqual(x["baselineMissing"],2)
  self.assertEqual(x["endMissing"],2)
  self.assertEqual(x["allAssignedDirectionIdentified"],"unresolved")
 def test_no_assumption_that_missing_means_zero(self):
  x=bounded_change_summary([(3,2),(3,None)])
  self.assertEqual(x["meanChangeBounds"],[-2,0])
  self.assertEqual(x["completeCaseMeanChange"],-1)
 def test_cross_group_contrast_uses_opposite_endpoints(self):
  treatment=bounded_change_summary([(2,None)])
  control=bounded_change_summary([(2,2)])
  out=contrast_to_reference(treatment,control)
  self.assertEqual(out["differenceInChangeBounds"],[-2,2])
  self.assertEqual(out["allAssignedSignIdentified"],"unresolved")
 def test_fails_closed_out_of_scale(self):
  with self.assertRaises(ValueError):bounded_change_summary([(5,2)])
  with self.assertRaises(ValueError):bounded_change_summary([(0,float("nan"))])
  with self.assertRaises(ValueError):bounded_change_summary([])
  with self.assertRaises(ValueError):bounded_change_summary([(1,2)],4,4)

if __name__=="__main__":unittest.main()
