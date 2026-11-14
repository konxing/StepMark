"""Deterministic local schema and missingness tests; no remote fetch."""
import unittest
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

path = Path(__file__).with_name("validate-openesm-burden.py")
spec = spec_from_file_location("openesm_burden", path)
module = module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)

HEADER="id\tday\tcompliance\tstudy_burden"
def tsv(*lines):
    return (HEADER+"\n"+"\n".join(lines)+"\n").encode("utf-8")

class BurdenTests(unittest.TestCase):
    def test_known_unknown_and_paired_person_not_pooled_row_bias(self):
        result=module.audit_tsv(tsv(
            "a\t1\t1\t2","a\t7\t\t",
            "a\t8\t0\t4","b\t1\t0\t2","b\t8\t1\t3"),verify_hash=False)
        self.assertEqual(result["recordedRows"],5)
        self.assertEqual(result["participantCount"],2)
        self.assertEqual(result["firstSevenStudyDays"]["complianceUnknownOnRecordedRows"],1)
        self.assertEqual(result["participantsWithPairedKnownCompliance"],2)
        self.assertEqual(result["meanWithinParticipantLastMinusFirstRecordedCompliance"],0)
        self.assertEqual(result["lastSevenStudyDays"]["meanRecordedBurden"],3.5)
    def test_corrupted_or_ambiguous_sources_fail_closed(self):
        with self.assertRaisesRegex(ValueError,"hash"):
            module.audit_tsv(tsv("a\t1\t1\t2"))
        for raw in (tsv("a\t1\t3\t2"),tsv("a\t1\t0\t-1"),
                    tsv("a\t20\t1\t2"),tsv("a\t2\t1\t2"),
                    b"wrong\tschema\n"):
            with self.assertRaises(ValueError):
                module.audit_tsv(raw,verify_hash=False)
    def test_implicit_calendar_nonresponse_not_fabricated(self):
        result=module.audit_tsv(tsv("a\t1\t1\t1","a\t14\t1\t5"),verify_hash=False)
        self.assertEqual(result["recordedRows"],2)
        self.assertEqual(result["firstSevenStudyDays"]["knownComplianceRate"],1)
        self.assertEqual(result["lastSevenStudyDays"]["knownComplianceRate"],1)
        self.assertEqual(result["firstSevenStudyDays"]["complianceUnknownOnRecordedRows"],0)
        self.assertEqual(result["lastSevenStudyDays"]["complianceUnknownOnRecordedRows"],0)

if __name__=="__main__":
    unittest.main()
