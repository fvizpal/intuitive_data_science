import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { evidenceStack } from './scorecard';
import type { FeatureBins } from './scorecard';
import {
  defaultsInWords,
  oddsFactorSpoken,
  oddsFactorText,
  oddsText,
  signedNum,
} from './format';
import { getFitted } from './pipeline';
import { usePage } from './store';

const ANSWER = 2;
const CHOICES = ['safer', 'riskier', 'it depends'];

/** Indices of bins that have people in them. */
const shownBins = (fb: FeatureBins) =>
  fb.stats.map((s, i) => (s.count > 0 ? i : -1)).filter((i) => i >= 0);

type Picks = number[];

function presets(bins: readonly FeatureBins[]) {
  const best = (fb: FeatureBins) =>
    shownBins(fb).reduce((a, b) => (fb.stats[b]!.woe > fb.stats[a]!.woe ? b : a));
  const worst = (fb: FeatureBins) =>
    shownBins(fb).reduce((a, b) => (fb.stats[b]!.woe < fb.stats[a]!.woe ? b : a));
  const middle = (fb: FeatureBins) =>
    shownBins(fb).reduce((a, b) =>
      Math.abs(fb.stats[b]!.woe) < Math.abs(fb.stats[a]!.woe) ? b : a,
    );
  return {
    // bureau + years safe, days past due risky, turnover close to neutral.
    mixed: [best(bins[0]!), worst(bins[1]!), best(bins[2]!), middle(bins[3]!)] as Picks,
    safe: bins.map(best) as Picks,
    risky: bins.map(worst) as Picks,
  };
}

function Inner() {
  const { seed, guess } = usePage();
  const fitted = getFitted(seed);
  const { bins, portfolioOdds } = fitted;
  const p = presets(bins);
  const [picks, setPicks] = useState<Picks>(p.mixed);
  // Keep picks valid if the reader reshuffles to a dataset with different bins in use.
  const safePicks = picks.map((v, j) => (bins[j]!.stats[v]?.count ? v : p.mixed[j]!));

  const woes = safePicks.map((v, j) => bins[j]!.stats[v]!.woe);
  const result = evidenceStack(portfolioOdds, woes);

  // Fixed axis (log-odds from 1:1 up) so bars do not jump while picking.
  const maxLog =
    result.startLogOdds +
    bins.reduce(
      (s, fb) => s + Math.max(0, ...shownBins(fb).map((i) => fb.stats[i]!.woe)),
      0,
    );
  const domain = maxLog + 0.2;
  const x = (v: number) => `${(Math.max(0, v) / domain) * 100}%`;
  const w = (a: number, b: number) => `${(Math.abs(b - a) / domain) * 100}%`;

  const finalDiff = result.finalLogOdds - result.startLogOdds;
  const rows: {
    key: string;
    title: string;
    detail: string;
    from: number;
    to: number;
    tone: 'pos' | 'neg';
    spoken: string;
  }[] = result.steps.map((s, j) => ({
    key: bins[j]!.key,
    title: `${bins[j]!.label}: ${bins[j]!.labels[safePicks[j]!]}`,
    detail: `${s.woe > 0.05 ? '▲ safer' : s.woe < -0.05 ? '▼ riskier' : '● neutral'} · WoE ${signedNum(s.woe)} → ${oddsFactorText(s.woe)}`,
    from: j === 0 ? result.startLogOdds : result.steps[j - 1]!.logOdds,
    to: s.logOdds,
    tone: s.woe >= 0 ? 'pos' : 'neg',
    spoken: `${bins[j]!.label} ${bins[j]!.labels[safePicks[j]!]}: ${oddsFactorSpoken(s.woe)}`,
  }));

  const summary = `Start at odds ${oddsText(result.startOdds)}. ${rows.map((r) => r.spoken).join('. ')}. This customer: odds ${oddsText(result.finalOdds)}, ${defaultsInWords(result.finalPd)}.`;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {bins.map((fb, j) => (
          <SegmentedControl
            key={fb.key}
            label={fb.label}
            value={String(safePicks[j])}
            onChange={(v) =>
              setPicks((cur) => cur.map((c, k) => (k === j ? Number(v) : c)))
            }
            options={shownBins(fb).map((i) => ({
              value: String(i),
              label: fb.labels[i]!,
            }))}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => setPicks(p.mixed)}>Mixed: two safe, one risky</Button>
        <Button onClick={() => setPicks(p.safe)}>All safe</Button>
        <Button onClick={() => setPicks(p.risky)}>All risky</Button>
        <Button onClick={() => setPicks(p.mixed)}>Reset</Button>
      </div>

      <ol className="m-0 mt-4 grid list-none gap-3 p-0">
        <li>
          <div className="flex flex-wrap justify-between gap-x-2 text-sm">
            <span className="font-semibold">Portfolio odds</span>
            <span className="font-mono">
              {oddsText(result.startOdds)} · {defaultsInWords(1 / (1 + result.startOdds))}
            </span>
          </div>
          <div className="relative mt-1 h-5 rounded-sm bg-bg">
            <div
              className="absolute inset-y-0 left-0 rounded-sm bg-muted"
              style={{ width: x(result.startLogOdds) }}
            />
          </div>
        </li>
        {rows.map((r) => (
          <li key={r.key}>
            <div className="flex flex-wrap justify-between gap-x-2 text-sm">
              <span className="font-semibold">{r.title}</span>
              <span className="font-mono" style={{ color: `var(--color-${r.tone})` }}>
                {r.detail}
              </span>
            </div>
            <div className="relative mt-1 h-5 rounded-sm bg-bg">
              <div
                className="absolute inset-y-0 rounded-sm transition-[left,width] duration-300"
                style={{
                  left: x(Math.min(r.from, r.to)),
                  width: w(r.from, r.to),
                  minWidth: 3,
                  background: `var(--color-${r.tone})`,
                  backgroundImage:
                    r.tone === 'neg'
                      ? 'repeating-linear-gradient(135deg, transparent 0 4px, rgb(0 0 0 / 0.25) 4px 6px)'
                      : undefined,
                }}
              />
            </div>
          </li>
        ))}
        <li>
          <div className="flex flex-wrap justify-between gap-x-2 text-sm">
            <span className="font-semibold">This customer</span>
            <span className="font-mono font-semibold">
              {oddsText(result.finalOdds)} · {defaultsInWords(result.finalPd)}
            </span>
          </div>
          <div className="relative mt-1 h-5 rounded-sm bg-bg">
            <div
              className="absolute inset-y-0 left-0 rounded-sm border-2 transition-[width] duration-300"
              style={{
                width: x(result.finalLogOdds),
                borderColor: `var(--color-${finalDiff >= 0 ? 'pos' : 'neg'})`,
                background: 'var(--color-accent)',
                opacity: 0.85,
              }}
            />
          </div>
          <div className="mt-0.5 text-xs text-muted">Evidence only, before weighting</div>
        </li>
      </ol>

      <p className="m-0 mt-3 text-sm">
        {guess !== null && (
          <>
            You said <strong>{CHOICES[guess]}</strong>
            {guess === ANSWER ? ': right. ' : '. '}
          </>
        )}
        <strong>Answer: it depends.</strong> Evidence adds by size, so here the net is{' '}
        {finalDiff > 0.05 ? 'safer' : finalDiff < -0.05 ? 'riskier' : 'about the same as'}{' '}
        {finalDiff > 0.05 || finalDiff < -0.05 ? 'than ' : ''}the portfolio.
      </p>
      <p className="sr-only" role="status">
        {summary}
      </p>
    </>
  );
}

export function EvidenceStack() {
  return (
    <ClientOnly
      minHeight={620}
      label="Evidence stack: pick a bin for each feature and see the odds add up"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
