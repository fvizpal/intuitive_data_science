import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { defaultsInWords, fmtInt, riskBand, signedInt } from './format';
import { getFitted } from './pipeline';
import { applicantScore, pdFromScore, reasonCodes } from './scorecard';
import type { FeatureBins, PointsTable } from './scorecard';
import { getPointsTable, usePage } from './store';

const shown = (fb: FeatureBins) =>
  fb.stats.map((s, i) => (s.count > 0 ? i : -1)).filter((i) => i >= 0);

function presets(bins: readonly FeatureBins[], table: PointsTable) {
  const common = (fb: FeatureBins) =>
    shown(fb).reduce((a, b) => (fb.stats[b]!.count > fb.stats[a]!.count ? b : a));
  const top = (j: number) => {
    const f = table.features[j]!;
    return shown(bins[j]!).reduce((a, b) => (f.points[b]! > f.points[a]! ? b : a));
  };
  const average = bins.map(common);
  return {
    strong: bins.map((_, j) => top(j)),
    average,
    thin: average.map((v, j) => (j === 0 ? bins[0]!.stats.length - 1 : v)),
  };
}

function Inner() {
  const { seed, scaling } = usePage();
  const fitted = getFitted(seed);
  const table = getPointsTable(fitted, scaling);
  const { bins } = fitted;
  const preset = useMemo(() => presets(bins, table), [bins, table]);
  const [picks, setPicks] = useState<number[]>(preset.average);
  const [expanded, setExpanded] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 640,
  );

  const safe = picks.map((v, j) => (bins[j]!.stats[v]?.count ? v : preset.average[j]!));
  const { total, perFeature } = applicantScore(table, safe);
  const pd = pdFromScore(total, scaling);
  const codes = reasonCodes(table, safe, 3);

  // Population-weighted average points of each feature: the "typical applicant".
  const typical = table.features.map((f, j) => {
    const st = bins[j]!.stats;
    const n = st.reduce((s, b) => s + b.count, 0);
    return f.points.reduce((s, p, i) => s + p * st[i]!.count, 0) / Math.max(1, n);
  });
  const best = table.features.map((f) =>
    Math.max(...f.points.filter((_, i) => f.available[i])),
  );

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="min-w-0 md:order-2">
        <div className="grid gap-3">
          {bins.map((fb, j) => (
            <SegmentedControl
              key={fb.key}
              label={fb.label}
              value={String(safe[j])}
              onChange={(v) => setPicks(safe.map((c, k) => (k === j ? Number(v) : c)))}
              options={shown(fb).map((i) => ({ value: String(i), label: fb.labels[i]! }))}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => setPicks(preset.strong)}>Strong applicant</Button>
          <Button onClick={() => setPicks(preset.average)}>Average applicant</Button>
          <Button onClick={() => setPicks(preset.thin)}>
            Thin file, missing bureau score
          </Button>
          <Button onClick={() => setPicks(preset.average)}>Reset</Button>
        </div>

        <div className="mt-4 rounded-md border border-grid bg-bg p-3">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-4xl font-bold tabular-nums">
              {fmtInt(total)}
            </span>
            <span className="text-sm">
              <strong>{riskBand(pd)}</strong>
              <br />
              <span className="text-muted">{defaultsInWords(pd)}</span>
            </span>
          </div>
          <div className="mt-1 font-mono text-xs text-muted">
            {perFeature.map((p) => fmtInt(p)).join(' + ')} = {fmtInt(total)}
          </div>
          <ul className="m-0 mt-3 grid list-none gap-2 p-0">
            {table.features.map((f, j) => {
              const pts = perFeature[j]!;
              const delta = pts - typical[j]!;
              const tone = delta >= 0 ? 'pos' : 'neg';
              return (
                <li key={f.key}>
                  <div className="flex justify-between gap-2 text-xs">
                    <span>{f.label}</span>
                    <span className="font-mono">
                      <strong>{fmtInt(pts)}</strong> pts ·{' '}
                      <span style={{ color: `var(--color-${tone})` }}>
                        {delta >= 0 ? '▲' : '▼'} {signedInt(delta)} vs typical
                      </span>
                    </span>
                  </div>
                  <div className="mt-0.5 h-3 rounded-sm bg-surface">
                    <div
                      className="h-full rounded-sm transition-[width] duration-300"
                      style={{
                        width: `${Math.max(2, (pts / best[j]!) * 100)}%`,
                        background: `var(--color-${tone})`,
                        backgroundImage:
                          tone === 'neg'
                            ? 'repeating-linear-gradient(135deg, transparent 0 4px, rgb(0 0 0 / 0.25) 4px 6px)'
                            : undefined,
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-3 rounded-md border border-grid bg-bg p-3">
          <h4 className="m-0 text-sm font-semibold">Why this score?</h4>
          {codes.length ? (
            <ol className="m-0 mt-1 list-decimal pl-5 text-sm">
              {codes.map((c) => (
                <li key={c.key}>{c.text}</li>
              ))}
            </ol>
          ) : (
            <p className="m-0 mt-1 text-sm">No points lost: best bin on every feature.</p>
          )}
        </div>
      </div>

      <div className="min-w-0 md:order-1">
        <h4 className="m-0 mb-1 text-sm font-semibold">Points per bin</h4>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 pr-2 font-normal">Feature</th>
                <th className="py-1 pr-2 font-normal">Bin</th>
                <th className="py-1 text-right font-normal">Points</th>
              </tr>
            </thead>
            <tbody>
              {table.features.map((f, j) =>
                shown(bins[j]!)
                  .filter((i) => expanded || i === safe[j])
                  .map((i, k) => {
                    const on = i === safe[j];
                    return (
                      <tr
                        key={`${f.key}-${i}`}
                        className={`${k === 0 ? 'border-t border-grid' : ''} ${on ? 'bg-bg font-semibold' : 'text-muted'}`}
                        aria-current={on ? 'true' : undefined}
                      >
                        <td className="py-1 pr-2 align-top">{k === 0 ? f.label : ''}</td>
                        <td className="py-1 pr-2">
                          {on && <span aria-hidden="true">▸ </span>}
                          {f.binLabels[i]}
                        </td>
                        <td className="py-1 text-right font-mono tabular-nums">
                          {fmtInt(f.points[i]!)}
                        </td>
                      </tr>
                    );
                  }),
              )}
            </tbody>
          </table>
        </div>
        <Button className="mt-2 md:hidden" onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Show only selected bins' : 'Show all bins'}
        </Button>
      </div>

      <p className="sr-only" role="status">
        Score {total}, {riskBand(pd)}, {defaultsInWords(pd)}. Points:{' '}
        {table.features.map((f, j) => `${f.label} ${perFeature[j]}`).join(', ')}.
        {codes.length ? ` Main reason: ${codes[0]!.text}` : ''}
      </p>
    </div>
  );
}

export function ApplicantScorecard() {
  return (
    <ClientOnly
      minHeight={780}
      label="Applicant scorecard: pick a bin for each feature to see the points, the score and the reasons"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
