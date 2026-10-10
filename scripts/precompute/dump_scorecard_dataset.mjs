// Dumps the seed-42 WoE-encoded scorecard dataset to .tmp/scorecard/seed42.csv (gitignored)
// so fit_scorecard.py can fit the same model with statsmodels.
// Usage: node scripts/precompute/dump_scorecard_dataset.mjs
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const outDir = path.join(root, '.tmp', 'scorecard');
mkdirSync(outDir, { recursive: true });

const bundle = path.join(outDir, 'pipeline.bundle.mjs');
await build({
  stdin: {
    contents:
      "export * from './src/widgets/scorecard/pipeline'; export * from './src/widgets/scorecard/bins';",
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: bundle,
  logLevel: 'error',
});

const { getFitted, SCORECARD_SEED, SCORECARD_KEYS } = await import(
  pathToFileURL(bundle).href
);
const f = getFitted(SCORECARD_SEED);
const header = [...SCORECARD_KEYS.map((k) => `${k}_woe`), 'good'].join(',');
const lines = f.X.map((row, i) => [...row, f.y[i]].join(','));
writeFileSync(
  path.join(outDir, `seed${SCORECARD_SEED}.csv`),
  [header, ...lines].join('\n') + '\n',
);
console.log(`wrote ${lines.length} rows to .tmp/scorecard/seed${SCORECARD_SEED}.csv`);
