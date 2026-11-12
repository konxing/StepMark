import importlib.util
from pathlib import Path
import tempfile
import unittest

import numpy as np

MODULE=Path(__file__).with_name("validate-icar.py")
spec=importlib.util.spec_from_file_location("validate_icar",MODULE)
icar=importlib.util.module_from_spec(spec)
spec.loader.exec_module(icar)

class IcarResearchTest(unittest.TestCase):
    def test_source_schema_and_binary_guard(self):
        expected={"expected_rows":3,"expected_respondents":2,"expected_items":2}
        with tempfile.TemporaryDirectory() as d:
            file=Path(d)/"bad.csv"
            file.write_text("id,item,resp\na,q1,0\na,q2,1\nb,q1,2\n",encoding="utf-8")
            with self.assertRaisesRegex(ValueError,"BINARY"):
                icar.read_verified_data(file,expected)

    def test_posterior_uses_only_context_and_is_normalized(self):
        a=np.array([1.,1.2,1.4])
        c=np.array([0.1,-0.1,0.2])
        matrix=np.array([[1.,0.,np.nan],[0.,1.,np.nan]])
        p=icar.posterior_for(matrix,a,c)
        self.assertEqual(p.shape,(2,len(icar.GRID)))
        self.assertTrue(np.allclose(p.sum(axis=1),1))
        mutated=matrix.copy()
        mutated[:,2]=1.
        self.assertFalse(np.allclose(p,icar.posterior_for(mutated,a,c)))

    def test_small_synthetic_fit_1pl_2pl_remains_finite(self):
        rng=np.random.default_rng(42)
        theta=rng.normal(size=150)
        difficulty=np.linspace(-1,1,6)
        probs=1/(1+np.exp(-(theta[:,None]-difficulty[None,:])))
        data=(rng.random((150,6))<probs).astype(float)
        data[rng.random((150,6))<.2]=np.nan
        for two_pl in (False,True):
            a,c,diag=icar.fit_mml(data,two_pl,max_em=3)
            self.assertTrue(np.all(np.isfinite(a)))
            self.assertTrue(np.all(np.isfinite(c)))
            self.assertTrue(np.all(a>0))
            self.assertEqual(diag["iterations"],3)

    def test_brier_and_ci_direction(self):
        self.assertAlmostEqual(icar.brier(np.array([.8]),np.array([1.])),.04)
        z=np.array([.2]*40)
        self.assertGreater(icar.confidence_interval(z)[0],0)
        self.assertIsNone(icar.confidence_interval(z[:3]))

if __name__=="__main__":
    unittest.main()
