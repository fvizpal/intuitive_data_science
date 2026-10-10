"""Fit the scorecard logistic model with statsmodels on the dumped seed-42 dataset.

Writes src/widgets/scorecard/fixtures/coefs.json, which scorecard.test.ts compares with
the TypeScript fit. See scripts/precompute/README.md for the two-step regeneration.
"""
import json
from pathlib import Path

import numpy as np
import statsmodels.api as sm

root = Path(__file__).resolve().parents[2]
csv = root / ".tmp" / "scorecard" / "seed42.csv"
header = csv.read_text().splitlines()[0].split(",")
data = np.loadtxt(csv, delimiter=",", skiprows=1)
X, y = data[:, :-1], data[:, -1]  # y = 1 means GOOD (repaid)

fit = sm.Logit(y, sm.add_constant(X)).fit(disp=0, maxiter=100)
out = {
    "seed": 42,
    "features": [h.removesuffix("_woe") for h in header[:-1]],
    "intercept": float(fit.params[0]),
    "coefs": [float(c) for c in fit.params[1:]],
    "n": int(len(y)),
    "statsmodels": sm.__version__,
}
dest = root / "src" / "widgets" / "scorecard" / "fixtures" / "coefs.json"
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(json.dumps(out, indent=2) + "\n")
print(f"wrote {dest.relative_to(root)}: {out['coefs']}")
