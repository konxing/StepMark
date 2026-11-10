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
- Exploratory asymptotic progression curve `H(n)=H0+(Hmax-H0)*(1-exp(-k*n))` with `0<=H0<=Hmax<=100, 0<k<=1`. `n` = context-linked effective repetitions. Fit to repeated automaticity observations, not inferred from repetition counts. The code uses a deterministic coarse grid over rates and asymptotes; it returns `exploratory` and RMSE. This **is our engineering approximation** reflecting Lally et al.'s asymptotic observations, not a population-calibrated universal law. No automatic "habit complete" threshold.
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
