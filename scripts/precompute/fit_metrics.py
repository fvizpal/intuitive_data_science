"""Reference AUC and KS for the seed-42 scorecard scores, from scikit-learn and SciPy.

Reads .tmp/scorecard/seed42_scores.csv (see dump_scorecard_scores.mjs) and writes
src/widgets/separation/fixtures/metrics.json, which metrics.test.ts compares with the
TypeScript implementation within 1e-6. See scripts/precompute/README.md.
"""
import json
from pathlib import Path

import numpy as np
import scipy
import sklearn
from scipy.stats import ks_2samp
from sklearn.metrics import roc_auc_score

root = Path(__file__).resolve().parents[2]
data = np.loadtxt(root / ".tmp" / "scorecard" / "seed42_scores.csv", delimiter=",", skiprows=1)
score, good = data[:, 0], data[:, 1]  # good = 1 means repaid; higher score = safer

out = {
    "seed": 42,
    "n": int(len(score)),
    "nGood": int(good.sum()),
    "nBad": int(len(score) - good.sum()),
    "auc": float(roc_auc_score(good, score)),
    "ks": float(ks_2samp(score[good == 1], score[good == 0]).statistic),
    "scikit-learn": sklearn.__version__,
    "scipy": scipy.__version__,
}
out["gini"] = 2 * out["auc"] - 1
dest = root / "src" / "widgets" / "separation" / "fixtures" / "metrics.json"
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(json.dumps(out, indent=2) + "\n")
print(f"wrote {dest.relative_to(root)}: AUC {out['auc']:.6f}, KS {out['ks']:.6f}")
