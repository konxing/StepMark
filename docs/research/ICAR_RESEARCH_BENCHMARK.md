# ICAR SAPA research benchmark: source-pinned original response data

## Provenance, rights and scope

Primary source: Condon & Revelle (2016), *Selected ICAR Data from the SAPA-Project*, Harvard Dataverse: https://doi.org/10.7910/DVN/AD9RVY, release V3.

- Research-only **original scored response** file: `sapaICARData18aug2010thru20may2013.csv`. Dataverse V3 catalog identifies this scored CSV as publicly released; contains 0/1 per cognitive item. Study article: https://reference-global.com/article/10.5334/jopd.25?tab=article .
- Fixed original-file SHA-256 `27b22368434e94278d4cfee238770339f8e90da6229ef9ffd95900c4972426e5`, size **18,796,756** bytes, independently reported with the Dataverse V3 original source by https://mindrankiq.com/about/. Workflow **fails closed** if official API returns different bytes, missing metadata, or a different release. Dataset source file's own metadata should be separately reconciled if upstream changes.
- Only scored 0/1 response values for exactly 60 cognitive items are used (LN, MR, R3D, VR prefixes). No question wording, response keys or identifiable demographic variables are published or passed into StepMark production. **ICAR item materials** retain separate restrictions despite CC0 score data.
- This data describes non-representative online participants. The ability model assumes a **single latent factor** without empirical verification across four subtests. The model cannot validate StepMark's unrelated six-item logic A/B forms.

## Why the workflow uses primary Dataverse data

The initially proposed IRW reformatted table was described as `item_response_warehouse v81.0` on https://itemresponsewarehouse.org/tables/icar_sapa/. The IRW R client v1.4.0 reported that **both** its v701 manifest's `v80.0` and the published table's `v81.0` were not available from Redivis in isolated GitHub Actions jobs. Repeated attempts therefore never produced a valid research sample. Rather than silently selecting the latest server version, StepMark switches to the publisher's original pinned V3 CSV from Harvard Dataverse. Former IRW extraction helper `fetch-icar-irw.R` is superseded and not invoked.

## Design and metrics

1. All rows are scanned with strict source SHA, format, binary encoding and 60-item checks. Deterministic SHA-based **respondent-row index** subsampling selects one in eight respondents; source file checksum pins row ordering.
2. 3/4 of sampled respondents fit item parameters and 1/4 are completely untouched in fitting. For held-out people, item targets (approximately 25% of their answered items) are determined by a separate SHA hash of row-index and item label, independent of outcomes. Remaining answers provide a small personal context.
3. Baselines: item-wise smoothed correct-response rates. Models: 1PL (discrimination fixed to 1) and exploratory 2PL (discrimination estimated by quadrature EM MML with regularization and bounds). These are not official ICAR item calibrations; convergence diagnostics are recorded.
4. Matched held-out comparisons: participant-equal-weight Brier score and log loss, paired participant-bootstrap 95% intervals for model minus baseline differences. Positive `brierImprovementVsItemRate` means candidate improved over baseline. A 95% interval crossing zero does not show a reliable advantage.
5. No identifiable respondent row or item text is logged or committed. Temporary CSV is deleted even if validation fails. Do not use this benchmark to declare population norms or generalized increases in user intelligence.

## Reproducing

Run `python -m unittest discover -s packages/core/scripts -p 'test_validate_icar.py' -v` with pinned Numpy/SciPy, then run the isolated GitHub workflow `.github/workflows/research-icar.yml`. Successful synthetic tests do not prove empirical psychometric predictive validity.

**Verified execution, 2026-11-13:** the original-source ICAR benchmark and the direct paired 2PL-versus-1PL rerun both completed successfully. See [ICAR_VALIDATION_RESULTS_2026-11-13.md](./ICAR_VALIDATION_RESULTS_2026-11-13.md) for exact metrics and appropriate limits. This does not certify StepMark's own A/B items.
