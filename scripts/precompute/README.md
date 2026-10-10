# Precompute

Python scripts here write small JSON files to `public/data/`. Nothing yet.

## Scorecard coefficient fixture

`src/widgets/scorecard/fixtures/coefs.json` holds the statsmodels `Logit` fit on the seed-42 WoE-encoded data; `scorecard.test.ts` checks the TypeScript fit against it within 1e-3. To regenerate (needs Python with `numpy` and `statsmodels`):

```bash
node scripts/precompute/dump_scorecard_dataset.mjs && python scripts/precompute/fit_scorecard.py
```

## KS / AUC fixture

`src/widgets/separation/fixtures/metrics.json` holds scikit-learn's `roc_auc_score` and SciPy's `ks_2samp` statistic for the seed-42 scorecard scores (default scaling); `metrics.test.ts` checks the TypeScript AUC and KS against it within 1e-6. To regenerate (needs Python with `numpy`, `scipy` and `scikit-learn`):

```bash
node scripts/precompute/dump_scorecard_scores.mjs && python scripts/precompute/fit_metrics.py
```
