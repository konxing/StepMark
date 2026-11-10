# StepMark research, measurement methods, and model contracts

**Research status: literature-backed design, not a validated assessment.** Version 0.1, 2026-11-10.
The mathematical functions in packages/core implement deterministic primitives only. Scientific use requires instrument adaptation, ethics/privacy review, calibration samples, reproducible scoring benchmarks, and validation.

## 1. What to measure

Do not claim one unified "human ability" score. Use a versioned registry of *constructs*, each with a test blueprint, observed indicators, discriminant/convergent validation, evidence quality and uncertainty. Initial constructs: reasoning.logic, expression.structure, attention.control. Add metacognition, prediction calibration, observation, transfer-of-learning only after validating tasks.

The NIH Toolbox Cognition Battery adult validation provides precedents for measuring executive function with test-retest/convergent/discriminant evidence. OECD PIAAC provides a reference for literacy, numeracy, and adaptive problem solving.

Research:
- Zelazo et al. (2014) NIH Toolbox Cognition Battery (CB): Validation of executive function measures in adults: https://scispace.com/papers/nih-toolbox-cognition-battery-cb-validation-of-executive-3wslh3fz8c
- OECD Survey of Adult Skills: https://www.oecd.org/en/publications/survey-of-adult-skills-2023_3639d1e2-en.html
- AERA/APA/NCME Standards for Educational and Psychological Testing: https://ncme.org/resources/books/testing-standards/
- Millsap (2010) Testing Measurement Invariance Using Item Response Theory in Longitudinal Data: https://scispace.com/papers/testing-measurement-invariance-using-item-response-theory-in-2p23etklpk

## 2. Habits: separate constructs, do not make them ability points

- Adherence `C = sum(eligible_i * completed_i) / sum(eligible_i)`. Return **null** if there are no eligible opportunities, not zero. Record whether an opportunity was eligible; deduplicate by (habitId, opportunityKey). 
- Automaticity index: compute `S = 100 * (mean(q1..q4) - 1) / 6` for 4 Likert 1..7 responses. **This normalization is a product display transformation** and does not establish interval measurement, equivalent items, or validity. The current code deliberately does not reproduce a copyrighted or licensed translation. Only use a properly sourced and validated SRBAI translation before naming measured results "SRBAI".
- Exploratory asymptotic progression curve `H(n)=H0+(Hmax-H0)*(1-exp(-k*n))` with `0<=H0<=Hmax<=100, 0<k<=1`. `n` = context-linked effective repetitions. Fit to repeated automaticity observations, not inferred from repetition counts. The v2 code fits the intercept rather than anchoring the first observation, uses a deterministic rate grid and compares against a constant model with AICc; it returns an `exploratory` estimate and diagnostics. This **is our engineering approximation** reflecting Lally et al.'s asymptotic observations, not a population-calibrated universal law. No automatic "habit complete" threshold.
- Distinguish habit *instigation* (starting after a cue) versus *execution* (automatic performance of steps); v0.1 only measures an undifferentiated self-reported proxy. Add distinct observations in phase 2.
- For individual fit validity require enough repeated observations across time/behavior, missingness analysis, sensitivity to alternative models, posterior/bootstrapped uncertainty and holdout prediction; six samples in code are solely a guard against nonsensical fits.

Research:
- Verplanken & Orbell (2003) SRHI: https://scispace.com/papers/reflections-on-past-behavior-a-self-report-index-of-habit-jmp3ws5ueu
- Lally et al. (2010) How are habits formed?: https://scispace.com/papers/how-are-habits-formed-modelling-habit-formation-in-the-real-4iq5e623zp
- Gardner et al. (2012) SRBAI automaticity subscale: https://scispace.com/papers/towards-parsimony-in-habit-measurement-testing-the-4x2rbk8226
- Gardner et al. (2016) Habitual instigation and habitual execution: https://scispace.com/papers/habitual-instigation-and-habitual-execution-definition-5d959gh006
- Lally & Gardner (2013) Promoting habit formation: https://scispace.com/papers/promoting-habit-formation-8y8vm90y78
- Gollwitzer (1999) Implementation intentions: https://scispace.com/papers/implementation-intentions-strong-effects-of-simple-plans-5a7euxxbxr

## 3. Item-response theory (2PL)

For **calibrated dichotomous items**, `P(X_i=1|theta) = 1/(1 + exp(-a_i*(theta-b_i)))`.
`a_i>0` is discrimination, `b_i` difficulty, `theta` ability on a defined latent scale.
Binary item Fisher information `I_i(theta)=a_i^2*P_i*(1-P_i)`.
Implemented: probability and information. NOT implemented: parameter calibration, posterior ability estimation, CAT or normative percentiles.

Do not assume estimated theta values are comparable across constructs, across independently calibrated forms, or across time without measurement invariance and linking. Until real calibration, report task-specific raw performance and uncertainty, not a scientific "IQ" or global intelligence index.

## 4. Open-ended communication scoring

Create an explicit anchored rubric with dimensions `d`, positive weights `w_d`, ordinal levels `r_d in {0,1,2,3,4}`.
`TaskScore = 100 * sum(w_d*r_d)/(4*sum(w_d))`.
It is a **task display score**, not automatically a psychometric measure. Fix scoring version; anchor each level with behavioral examples, hold back benchmark responses. Conduct blind double human scoring, calculate weighted kappa/ICC as appropriate, compare AI judges to experts, test score drift, variance across dialects and speaking conditions, and require reviewer escalation. 
AI output MUST be provisional, structured, schema-validated and auditable. Humans/explicit calibration determine whether scores can contribute to a capability estimate.

Research:
- Large language models and automated essay scoring of English language learner writing: Insights into validity and reliability (2024): https://scispace.com/papers/large-language-models-and-automated-essay-scoring-of-english-3gz6xvxrlv
- LLM-Rubric: A Multidimensional, Calibrated Approach: https://scispace.com/papers/llm-rubric-a-multidimensional-calibrated-approach-to-mplb310na4j3
- Unveiling Scoring Processes: Dissecting the Differences between LLMs and Human Graders (2024): https://scispace.com/papers/unveiling-scoring-processes-dissecting-the-differences-6u0kfrcz68yo

## 5. Predictive judgment calibration

For resolved binary forecasts, Brier score `BS = (1/N)*sum((p_i-y_i)^2)`, where `0<=p<=1` and `y in {0,1}`. Lower is better. The implementation checks inputs and does not fabricate outcomes.
Avoid treating raw Brier scores from very different event difficulties as directly comparable; track base-rate benchmarks, proper resolution and calibration plots.

## 6. Confidence and uncertainty

For an observed success fraction with independent Bernoulli trials, Wilson interval:
`center = (p + z^2/(2n))/(1+z^2/n)`
`half = z * sqrt(p*(1-p)/n + z^2/(4n^2))/(1+z^2/n)`
`[center-half, center+half]`, clipped to [0,1].
This is only for the observed proportion under relevant assumptions, **not a latent-ability confidence interval**. Repeated tasks on the same participant can violate independence. Provide effective sample size / longitudinal models later.

## 7. Habit-to-ability: test hypotheses, not auto-add points

Candidate exploratory longitudinal regression:
`Delta Ability(d,t) = beta(d,0) + sum_h beta(d,h)*Exposure(h,t) + epsilon(d,t)`.
Store relationships as hypotheses with evidence grade. Do not assign fixed positive multipliers, and do not claim causality from observational coefficients. Randomize task variants, alternate intervention periods where appropriate, add active controls, check maintenance and transfer to novel tasks.
Affecting trained-task speed ≠ general cognitive enhancement.

Research:
- Owen et al. (2010) Putting brain training to the test: https://scispace.com/papers/putting-brain-training-to-the-test-30pssc0a0z
- Simons et al. (2016) Do Brain-Training Programs Work?: https://scispace.com/papers/do-brain-training-programs-work-2iabn3a0mh
- Schmiedek et al. (2010) COGITO training and broad abilities (contrasting result): https://scispace.com/papers/hundred-days-of-cognitive-training-enhance-broad-cognitive-40r25rfiuh

## 8. Open source projects to investigate

- jsPsych (browser behavioral studies): https://github.com/jspsych/jsPsych
- lab.js (web experiment design): https://lab.js.org/
- PsychoPy and PsychoJS (experiment reference): https://github.com/psychopy/psychopy
- catsim (CAT simulations, Python): https://github.com/douglasrizzo/catsim
- mirt (IRT estimation in R): https://cran.r-project.org/package=mirt
- Habitica (gamified UX reference only): https://github.com/HabitRPG/habitica
- Promptfoo (LLM rubric regression testing): https://www.promptfoo.dev/docs/guides/llm-as-a-judge/

Check LICENSE, upstream security, third-party assets, test content copyright, mobile precision and protocol before integrating code. Do not copy test materials with restrictive licensing.

## 9. Further reading (not interchangeable with peer-reviewed scales)

- Douglas W. Hubbard, *How to Measure Anything*: operationalizing uncertain measurements.
- Robert F. DeVellis & Carolyn T. Thorpe, *Scale Development*: validation, reliability, and construct structure.
- Furr, *Psychometrics: An Introduction*: foundations for measurement models.
- James Clear, *Atomic Habits*: product-design inspiration only, not a source of validated psychometric thresholds.


## 10. Math upgrade v0.2 — Bayesian estimates, adaptive design and time-aware monitoring

**Scope:** deterministic core primitives with tests, plus an authorized habit-insights API. These are *candidate statistical models*, not product-valid normative psychological metrics.

### 10.1 Beta-Binomial smoothing for observed adherence

Let eligible opportunities be \(n\), completed opportunities \(s\), completion propensity \(p\), prior \(p\sim Beta(\alpha_0,\beta_0)\).
If opportunities are conditionally independent and exchangeable, the posterior is
\[
p\mid s,n \sim Beta(\alpha_0+s,\beta_0+n-s).
\]
Posterior mean \(E[p\mid s,n]=(\alpha_0+s)/(\alpha_0+\beta_0+n)\), posterior variance
\[
Var(p\mid s,n)=\frac{(\alpha_0+s)(\beta_0+n-s)}
 {(\alpha_0+\beta_0+n)^2(\alpha_0+\beta_0+n+1)}.
\]
StepMark uses the explicitly chosen experimental uniform \(Beta(1,1)\) prior, returns **null at n=0**, preserves the raw completion fraction and Wilson interval alongside the posterior mean and SD. A rate of 100% after a single success is not evidence of perfect future adherence. Correlation between opportunities makes the Beta-Binomial calculation overconfident; do not interpret as a clinical/psychometric credible interval.
**Implementation:** `packages/core/src/bayesian.ts`; owner-scoped aggregate API `GET /api/v1/habits/:id/insights`, backed by a `(habitId,eligible,completed)` database index.

### 10.2 Improved automaticity curve fit

The original curve incorrectly anchored its intercept at the first observation; the first self-report has noise and often occurs after many repetitions.
For observations \(y_i\) at actual effective repetition counts \(n_i\), fit
\[
\widehat y_i = b+(M-b)(1-e^{-kn_i}), \quad 0\le b\le M\le 100, k>0,
\]
minimizing \(\sum_i (y_i-\widehat y_i)^2\).
The v2 algorithm searches log-spaced \(k\) and solves bounded least-squares intercept/amplitude, without copying the first data point. It compares with constant automaticity via small-sample corrected AIC:
\[
AIC_c = n\log(RSS/n)+2K+\frac{2K(K+1)}{n-K-1}.
\]
The resulting `aiccAdvantage` and `trendSupported` are **exploratory descriptive fit diagnostics only**. Independent normal residual and sufficient repeated observations assumptions are not proven; held-out forecasting and patient-specific uncertainty are future work. No threshold implies a habit has formed.
**Implementation:** `packages/core/src/habit.ts` (model version `asymptote-constrained-ls-v2`).

### 10.3 Calibrated adaptive item selection: minimize variance per unit of time

After psychometrically validated 2PL item calibration, model \(P(X_i=1\mid\theta)\), combine binary answer likelihoods with a standard normal prior \(\theta\sim N(0,1)\), and compute posterior mean/variance by finite quadrature:
\[
p(\theta\mid\mathbf{x})\propto \phi(\theta)\prod_i P_i(\theta)^{x_i}(1-P_i(\theta))^{1-x_i}.
\]
For a candidate item \(j\) compute expected variance after observing its response
\[
EV_j=P_j(1)Var(\theta\mid X_j=1)+P_j(0)Var(\theta\mid X_j=0)
\]
where the predictive probabilities integrate over the **current posterior**. Score candidate by \(U_j=(Var(\theta\mid\mathbf{x})-EV_j)/E[T_j]\) (estimated seconds).

**Performance identity (exact under the binary posterior approximation):** by the law of total variance,
\[
\Delta V_j=Var(\theta\mid\mathbf{x})-EV_j
=\frac{Cov(\theta,X_j\mid\mathbf{x})^2}{p_j(1-p_j)},
\]
with \(p_j=E[P_j(\theta)\mid\mathbf{x}]\). The implementation computes \(p_j\) and \(E[\theta P_j(\theta)\mid\mathbf{x}]\) in a **single grid pass**, avoiding separately constructing two hypothetical posteriors for every candidate. A numerical equivalence unit test compares the result with the explicit conditional-variance calculation. This reduces model-side computation, but has not yet been independently benchmarked under production item-bank sizes.
Choose the highest valid utility after enforcing calibration version, item non-reuse, exposure cap and optional content balance. This may reduce burden by selecting informative shorter tests, but **requires real item calibration and empirical comparison before rollout**. No unvalidated item is accepted into this selector.

This follows literature on EAP, Bayesian selection and information-per-response-time:
- Bock & Mislevy (1982), *Adaptive EAP Estimation of Ability*: https://scispace.com/papers/adaptive-eap-estimation-of-ability-in-a-microcomputer-3bkw35snyd
- van der Linden (1998), *Bayesian item selection criteria*: https://scispace.com/papers/bayesian-item-selection-criteria-for-adaptive-testing-46nyyjq3s7
- Kyung (2018), *Components of the item selection algorithm*: https://pmc.ncbi.nlm.nih.gov/articles/PMC5968224/
- Choe et al. (2017), *Optimizing the Use of Response Times*: https://doi.org/10.3102/1076998617723642
- Ertuna et al. (2026), *A Comparison of Item Selection Methods and Parameter Estimation Approaches for Online Calibration*: https://doi.org/10.1177/00131644261478843
**Implementation:** `packages/core/src/adaptive.ts` — used only as a research API; existing four demo items remain uncalibrated and are **not** used with this module.

### 10.4 Online local-level state-space filter for linked retests

When scores have the **same calibrated scale**, tasks are comparably difficult, and their measurement standard errors are known, a local-level Gaussian filter may summarize repeated assessments without overreacting to one noisy observation. Assume
\[
\theta_t=\theta_{t-1}+\eta_t,\quad Var(\eta_t)=q\Delta t,\qquad
y_t=\theta_t+\epsilon_t,\quad Var(\epsilon_t)=r_t.
\]
Predict uncertainty \(V_t^-=V_{t-1}+q\Delta t\), Kalman gain \(K_t=V_t^-/(V_t^-+r_t)\), and update
\(m_t=m_{t-1}+K_t(y_t-m_{t-1})\), \(V_t=(1-K_t)V_t^-\).
Larger error means less weight on a test; a long gap allows more latent uncertainty. The returned ±1.96 SD band is conditional on the model assumptions, **not a proven human-development confidence band**. Never use uncalibrated question percentages in this filter.
- McArdle (2009), *Latent Variable Modeling of Differences and Changes with Longitudinal Data*: https://scispace.com/papers/latent-variable-modeling-of-differences-and-changes-with-qjfanm5ekd
- Schuurman & Hamaker (2019), *Measurement error and person-specific reliability*: https://scispace.com/papers/measurement-error-and-person-specific-reliability-in-4nsr8wh2u1
- Ferrer & McArdle (2010), *Longitudinal Modeling of Developmental Changes*: https://scispace.com/papers/longitudinal-modeling-of-developmental-changes-in-rvxud64uya
**Implementation:** `packages/core/src/longitudinal.ts` (not yet enabled on user ability screens).

### 10.5 Research warning: a good retrospective fit does not imply good future predictions

2025 evidence comparing multiple knowledge tracing models using time-based cross-validation reports failures to capture spacing and forgetting despite acceptable retrospective fit. We therefore require chronological holdouts and an explicit naive baseline before adding adaptive skill recommendations.
- Schuetze et al. (2025), *Capturing Session-to-Session Dynamics of Learning and Forgetting*: https://doi.org/10.1007/s40593-025-00508-3

### 10.6 Release gates for math models

1. Mathematical unit tests / stable numerics on edge cases.
2. Simulations under realistic missing data, dependence, device drift and item calibration uncertainty.
3. Time-split cross-validation, prospective scoring and calibration plots against simple baselines.
4. Only then use inferred ability values or automaticity trajectories in user-facing claims.
5. Audit sampling bias, demographic/device fairness, population representativeness, and privacy consent before any shared norms.

**Explicit product distinction:** observed completion is a raw behavioral fact, Bayesian completion propensity is a conditional prediction, self-reported automaticity is an experimental index, and latent ability is a separate psychometric construct.

### 10.7 Forecast skill relative to a **precommitted** reference

Absolute Brier loss depends on the underlying event frequency and mix; a low Brier score alone does not prove a person is an unusually good forecaster. For resolved binary events with forecast probability \(p_i\), outcome \(y_i\), and **independently specified, pre-resolution** baseline probability \(q_i\):
\[
 BS_{user} = \frac1N\sum_i(p_i-y_i)^2,\quad
 BS_{ref} = \frac1N\sum_i(q_i-y_i)^2,\quad
 BSS=1-\frac{BS_{user}}{BS_{ref}}.
\]
\(BSS>0\) means better than the stated reference on the evaluated events; \(BSS=0\) equals the reference; negative scores mean worse. If \(BS_{ref}=0\), the skill score is undefined and returns null. **Do not clip negative values**. The reference must be recorded before the user makes the forecast and before outcome resolution. Predictions on the same issue can be dependent; small samples cause large uncertainty, so do not convert BSS directly to a 0–100 human ability score.

Implementation: `packages/core/src/measurement.ts::brierSkillAgainstReference`, with mandatory reference policy version and validated timestamps. A research-only `prediction.calibration` construct has been added. A dedicated durable forecast journal, result adjudication, and reference-policy rules are required before making this user-facing.

References:
- Japan Meteorological Agency, *NWP Guide: A.3.2 Brier Skill Score*: https://www.jma.go.jp/jma/jma-eng/jma-center/nwp/outline2022-nwp/pdf/outline2022_all.pdf
- ECMWF, *Verification of Ensembles*: https://www.ecmwf.int/sites/default/files/elibrary/2007/15489-verification-probability-forecasts.pdf
- Bradley et al. (2008), *Sampling Uncertainty and Confidence Intervals for the Brier Score and Brier Skill Score*: https://doi.org/10.1175/2007WAF2007049.1
