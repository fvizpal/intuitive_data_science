import { useMemo } from 'react';
import type { KeyboardEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from './ClientOnly';
import { FeaturePicker } from './FeaturePicker';
import {
  FEATURES,
  READING_COLOR,
  READING_GLYPH,
  READING_TEXT,
  analyzeDefault,
  binLabel,
  binPhrase,
  fmtInt,
  pct,
  portfolioRate,
  rateReading,
} from './features';
import type { RankedKey } from './features';
import { getLoans, pageActions, usePage } from './store';

const READING_PHRASE = {
  safer: 'safer than',
  riskier: 'riskier than',
  average: 'about the same as',
} as const;
const KEYS: RankedKey[] = ['bureau_score', 'max_dpd_6m', 'years_in_business'];
const W = 400;
const H = 230;
const PAD = { l: 8, r: 8, t: 26, b: 44 };

const niceMax = (v: number) => Math.max(0.02, Math.ceil((v * 100) / 2) * 0.02);

function Inner() {
  const { seed, feature, bin } = usePage();
  const loans = getLoans(seed);
  const meta = FEATURES[feature];
  const { edges, bins } = useMemo(() => analyzeDefault(loans, feature), [loans, feature]);
  const shown = bins.filter((b) => b.count > 0);
  const avg = portfolioRate(loans);
  const sel = shown.find((b) => b.index === bin) ?? shown[0]!;

  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const slot = plotW / shown.length;
  const yMax = niceMax(Math.max(avg * 1.6, ...shown.map((b) => b.defaultRate)));
  const y = (r: number) => PAD.t + plotH * (1 - r / yMax);

  const dots = Math.round(sel.defaultRate * 100);
  const reading = rateReading(sel.defaultRate, avg);
  const phrase = binPhrase(meta, edges, sel.index);

  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pageActions.setBin(i);
    }
  };

  const summary = `Of ${fmtInt(sel.count)} people with ${phrase}, ${fmtInt(sel.bad)} defaulted (${pct(sel.defaultRate)}). That is ${READING_PHRASE[reading]} the ${pct(avg)} portfolio average.`;

  return (
    <>
      <FeaturePicker keys={KEYS} value={feature} onChange={pageActions.setFeature} />
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_9.5rem] sm:items-start">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          style={{ aspectRatio: `${W} / ${H}` }}
          role="group"
          aria-label={`Default rate of each ${meta.label} bin`}
        >
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={PAD.t + plotH}
            y2={PAD.t + plotH}
            stroke="var(--color-grid)"
          />
          {shown.map((b, i) => {
            const r = rateReading(b.defaultRate, avg);
            const x0 = PAD.l + i * slot;
            const barW = slot * 0.62;
            const bx = x0 + (slot - barW) / 2;
            const top = y(b.defaultRate);
            const on = b.index === sel.index;
            return (
              <g
                key={b.index}
                role="button"
                tabIndex={0}
                aria-pressed={on}
                aria-label={`${binLabel(meta, edges, b.index)}: default rate ${pct(b.defaultRate)}, ${READING_TEXT[r].toLowerCase()}`}
                onClick={() => pageActions.setBin(b.index)}
                onFocus={() => pageActions.setBin(b.index)}
                onKeyDown={(e) => onKey(e, b.index)}
                style={{ cursor: 'pointer', outline: 'none' }}
              >
                <rect
                  x={x0}
                  y={PAD.t}
                  width={slot}
                  height={plotH + PAD.b}
                  fill="transparent"
                />
                {on && (
                  <rect
                    x={x0 + 2}
                    y={PAD.t - 18}
                    width={slot - 4}
                    height={plotH + PAD.b + 16}
                    rx="4"
                    fill="var(--color-ink)"
                    fillOpacity="0.06"
                    stroke="var(--color-ink)"
                    strokeOpacity="0.5"
                  />
                )}
                <rect
                  x={bx}
                  y={top}
                  width={barW}
                  height={Math.max(1, PAD.t + plotH - top)}
                  fill={READING_COLOR[r]}
                  fillOpacity={r === 'average' ? 0.55 : 0.9}
                />
                <text
                  x={x0 + slot / 2}
                  y={top - 5}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="600"
                  fill="var(--color-ink)"
                >
                  {READING_GLYPH[r]} {pct(b.defaultRate)}
                </text>
                <text
                  x={x0 + slot / 2}
                  y={H - 26}
                  textAnchor="middle"
                  fontSize="12"
                  fill="var(--color-ink)"
                >
                  {binLabel(meta, edges, b.index)}
                </text>
                <text
                  x={x0 + slot / 2}
                  y={H - 11}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--color-muted)"
                >
                  {pct(b.pctOfPopulation, 0)}
                </text>
              </g>
            );
          })}
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={y(avg)}
            y2={y(avg)}
            stroke="var(--color-ink)"
            strokeDasharray="5 4"
            pointerEvents="none"
          />
        </svg>

        <div>
          <svg
            viewBox="0 0 100 100"
            className="mx-auto block h-auto w-full max-w-40"
            role="img"
            aria-label={`If 100 people were in this bin, about ${dots} would default`}
          >
            {Array.from({ length: 100 }, (_, i) => {
              const cx = (i % 10) * 10 + 5;
              const cy = Math.floor(i / 10) * 10 + 5;
              return i < dots ? (
                <rect
                  key={i}
                  x={cx - 3.6}
                  y={cy - 3.6}
                  width="7.2"
                  height="7.2"
                  fill="var(--color-neg)"
                />
              ) : (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r="3.2"
                  fill="none"
                  stroke="var(--color-muted)"
                  strokeWidth="1"
                />
              );
            })}
          </svg>
          <p className="m-0 mt-1 text-center text-xs text-muted">
            If 100 people were in this bin:{' '}
            <span className="text-neg">■ {dots} defaulted</span> · ○ {100 - dots} repaid
          </p>
        </div>
      </div>

      <p className="m-0 mt-2 text-xs text-muted">
        Bars: default rate (▲ safer, ▼ riskier than average). Dashed line: portfolio
        average {pct(avg)}. Small percent under each label: share of all people in that
        bin.
      </p>
      <p className="mb-0 mt-3 min-h-12 text-sm" role="status">
        {summary}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => pageActions.setFeature('bureau_score')}>Reset</Button>
      </div>
    </>
  );
}

export function BinsAndOdds() {
  return (
    <ClientOnly
      minHeight={560}
      label="Bins and odds: default rate of each bin, with a grid of 100 people"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
