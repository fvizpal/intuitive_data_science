// Dumps the seed-42 scorecard scores (default scaling) and good/bad flags to
// .tmp/scorecard/seed42_scores.csv (gitignored) so fit_metrics.py can check the TypeScript
// AUC and KS against scikit-learn and SciPy.
// Usage: node scripts/precompute/dump_scorecard_scores.mjs
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const outDir = path.join(root, '.tmp', 'scorecard');
mkdirSync(outDir, { recursive: true });

const bundle = path.join(outDir, 'scores.bundle.mjs');
await build({
  stdin: {
    contents:
      "export * from './src/widgets/scorecard/pipeline'; export * from './src/widgets/scorecard/scorecard';",
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: bundle,
  logLevel: 'error',
});

const m = await import(pathToFileURL(bundle).href);
const f = m.getFitted(m.SCORECARD_SEED);
const table = m.binPoints(f.model, f.bins, m.scaling(m.DEFAULT_SCALE));
const scores = m.scoreAll(f.loans.columns, table, f.bins);
const lines = scores.map((s, i) => `${s},${f.y[i]}`); // good = 1 (repaid)
writeFileSync(
  path.join(outDir, `seed${m.SCORECARD_SEED}_scores.csv`),
  ['score,good', ...lines].join('\n') + '\n',
);
console.log(
  `wrote ${lines.length} rows to .tmp/scorecard/seed${m.SCORECARD_SEED}_scores.csv`,
);
