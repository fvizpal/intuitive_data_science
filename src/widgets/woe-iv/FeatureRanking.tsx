import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Toggle } from '../../components/ui/Toggle';
import { ClientOnly } from './ClientOnly';
import { FeaturePicker } from './FeaturePicker';
import {
  FEATURES,
  RANKED_KEYS,
  READING_COLOR,
  READING_GLYPH,
  analyzeDefault,
  binLabel,
  signed,
  woeReading,
} from './features';
import type { RankedKey } from './features';
import { getLoans, pageActions, usePage } from './store';
import { IV_THRESHOLDS, ivStrength } from './woe';
import type { IvStrength } from './woe';

const PICKER_KEYS: RankedKey[] = ['bureau_score', 'max_dpd_6m', 'years_in_business'];
const LEAK = 'post_default_collection_calls' as const;

/** IV axis: the strength bands get equal-ish room, so small values stay readable. */
const STOPS = [0, 0.02, 0.1, 0.3, 0.5, 1] as const;
const POS = [0, 0.14, 0.3, 0.55, 0.78, 1] as const;
export function axisPos(iv: number): number {
  if (!Number.isFinite(iv) || iv <= 0) return 0;
  if (iv >= STOPS[5]) return 1;
  for (let i = 1; i < STOPS.length; i++) {
    if (iv <= STOPS[i]!) {
      const t = (iv - STOPS[i - 1]!) / (STOPS[i]! - STOPS[i - 1]!);
      return POS[i - 1]! + t * (POS[i]! - POS[i - 1]!);
    }
  }
  return 1;
}

const BANDS: { name: IvStrength; from: number; to: number }[] = [
  { name: 'not useful', from: 0, to: IV_THRESHOLDS.notUseful },
  { name: 'weak', from: IV_THRESHOLDS.notUseful, to: IV_THRESHOLDS.weak },
  { name: 'medium', from: IV_THRESHOLDS.weak, to: IV_THRESHOLDS.medium },
  { name: 'strong', from: IV_THRESHOLDS.medium, to: IV_THRESHOLDS.strong },
  { name: 'suspicious', from: IV_THRESHOLDS.strong, to: 1 },
];

const iv3 = (v: number) => (Number.isFinite(v) ? v.toFixed(3) : '—');

function StackedIv({ feature }: { feature: RankedKey }) {
  const { seed } = usePage();
  const loans = getLoans(seed);
  const meta = FEATURES[feature];
  const { edges, bins, iv } = useMemo(
    () => analyzeDefault(loans, feature),
    [loans, feature],
  );
  const shown = bins.filter((b) => b.count > 0 && b.ivContribution > 0);
  const W = 400;
  const barW = (W - 12) * axisPos(iv);
  const segments = shown.reduce<{ b: (typeof shown)[number]; w: number; x0: number }[]>(
    (acc, b) => {
      const prev = acc[acc.length - 1];
      const x0 = prev ? prev.x0 + prev.w : 6;
      return [...acc, { b, w: iv > 0 ? (b.ivContribution / iv) * barW : 0, x0 }];
    },
    [],
  );
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} 54`}
        className="block h-auto w-full"
        style={{ aspectRatio: `${W} / 54` }}
        role="img"
        aria-label={`Stacked bar: the IV contributions of each ${meta.label} bin add up to ${iv3(iv)}`}
      >
        <defs>
          <pattern
            id="iv-hatch"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill="var(--color-neg)" fillOpacity="0.28" />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              stroke="var(--color-neg)"
              strokeWidth="2.5"
            />
          </pattern>
        </defs>
        {segments.map(({ b, w, x0 }) => {
          const up = b.woe >= 0;
          return (
            <g key={b.index}>
              <rect
                x={x0}
                y="8"
                width={Math.max(0, w - 1)}
                height="28"
                fill={up ? 'var(--color-pos)' : 'url(#iv-hatch)'}
                stroke={up ? 'none' : 'var(--color-neg)'}
                strokeWidth="1.5"
                style={{ transition: 'width 300ms' }}
              />
              {w > 30 && (
                <text
                  x={x0 + w / 2}
                  y="26"
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fill="var(--color-ink)"
                >
                  {up ? '+' : '−'} {b.ivContribution.toFixed(3)}
                </text>
              )}
            </g>
          );
        })}
        <line x1="6" x2="6" y1="4" y2="40" stroke="var(--color-ink)" />
        <text x="6" y="52" fontSize="10" fill="var(--color-muted)">
          0
        </text>
        <text
          x={6 + barW}
          y="52"
          textAnchor="end"
          fontSize="11"
          fontWeight="600"
          fill="var(--color-ink)"
        >
          total IV {iv3(iv)}
        </text>
      </svg>
      <ul className="m-0 mt-2 grid list-none gap-x-4 gap-y-1 p-0 text-xs sm:grid-cols-2">
        {bins
          .filter((b) => b.count > 0)
          .map((b) => {
            const r = woeReading(b.woe);
            return (
              <li
                key={b.index}
                className="flex justify-between gap-2 border-b border-grid pb-0.5"
              >
                <span>{binLabel(meta, edges, b.index)}</span>
                <span className="font-mono">
                  <span style={{ color: READING_COLOR[r] }}>
                    {READING_GLYPH[r]} WoE {signed(b.woe)}
                  </span>{' '}
                  → adds {iv3(b.ivContribution)}
                </span>
              </li>
            );
          })}
      </ul>
    </div>
  );
}

function Inner() {
  const { seed, feature, guess } = usePage();
  const loans = getLoans(seed);
  const [leak, setLeak] = useState(false);

  const rows = useMemo(() => {
    const keys: (RankedKey | typeof LEAK)[] = leak
      ? [...RANKED_KEYS, LEAK]
      : [...RANKED_KEYS];
    return keys
      .map((k) => ({ key: k, iv: analyzeDefault(loans, k).iv }))
      .sort((a, b) => b.iv - a.iv);
  }, [loans, leak]);

  const honest = rows.filter((r) => r.key !== LEAK);
  const leakRow = rows.find((r) => r.key === LEAK);
  const guessRank = guess ? honest.findIndex((r) => r.key === guess) + 1 : 0;
  const best = honest[0]!;

  const W = 400;
  const ROW = 32;
  const top = 38;
  const labelW = 112;
  const x0 = labelW + 6;
  const plotW = W - x0 - 8;
  const H = top + ROW * 6 + 30;
  const px = (iv: number) => x0 + plotW * axisPos(iv);

  return (
    <>
      <h4 className="mb-2 mt-0 text-sm font-semibold">
        One feature: where does its IV come from?
      </h4>
      <FeaturePicker
        keys={PICKER_KEYS}
        value={feature}
        onChange={pageActions.setFeature}
      />
      <div className="mt-3">
        <StackedIv feature={feature} />
      </div>

      <h4 className="mb-1 mt-6 text-sm font-semibold">All features, ranked by IV</h4>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label="Features ranked by information value, on a background of strength bands"
      >
        {BANDS.map((b, i) => (
          <g key={b.name}>
            <rect
              x={px(b.from)}
              y={top - 6}
              width={px(b.to) - px(b.from)}
              height={ROW * 6 + 6}
              fill={b.name === 'suspicious' ? 'var(--color-neg)' : 'var(--color-ink)'}
              fillOpacity={b.name === 'suspicious' ? 0.1 : i % 2 ? 0.07 : 0.03}
            />
            <text
              x={(px(b.from) + px(b.to)) / 2}
              y={b.name === 'not useful' ? 12 : 22}
              textAnchor="middle"
              fontSize="9"
              fill="var(--color-muted)"
            >
              {b.name === 'not useful' ? (
                <>
                  <tspan x={(px(b.from) + px(b.to)) / 2}>not</tspan>
                  <tspan x={(px(b.from) + px(b.to)) / 2} dy="10">
                    useful
                  </tspan>
                </>
              ) : b.name === 'suspicious' ? (
                '⚠ suspicious'
              ) : (
                b.name
              )}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y = top + i * ROW;
          const isLeak = r.key === LEAK;
          const meta = FEATURES[r.key];
          const clipped = r.iv >= STOPS[5];
          const mine = r.key === guess;
          const inside = px(r.iv) > W - 64;
          return (
            <g key={r.key}>
              <text
                x={labelW}
                y={y + ROW / 2 + 1}
                textAnchor="end"
                fontSize="11"
                fontWeight={r.key === feature ? 700 : 400}
                fill="var(--color-ink)"
              >
                {meta.short}
              </text>
              <rect
                x={x0}
                y={y + 5}
                width={Math.max(2, px(r.iv) - x0)}
                height={ROW - 12}
                rx="2"
                fill={isLeak ? 'var(--color-neg)' : 'var(--color-accent)'}
                fillOpacity={isLeak ? 0.85 : 0.9}
                stroke={isLeak ? 'var(--color-neg)' : 'none'}
                strokeDasharray={isLeak ? '4 2' : undefined}
                style={{ transition: 'width 300ms' }}
              />
              <text
                x={inside ? px(r.iv) - 5 : px(r.iv) + 5}
                y={y + ROW / 2 + 1}
                fontSize="11"
                fontWeight="600"
                fill={inside ? 'var(--color-bg)' : 'var(--color-ink)'}
                textAnchor={inside ? 'end' : 'start'}
              >
                {clipped ? `▶ ${r.iv.toFixed(1)}` : iv3(r.iv)}
              </text>
              {mine && (
                <text x="2" y={y + ROW / 2 + 1} fontSize="11" fill="var(--color-accent)">
                  ★
                </text>
              )}
            </g>
          );
        })}
        <text x={x0} y={H - 8} fontSize="10" fill="var(--color-muted)">
          0
        </text>
        {[0.02, 0.1, 0.3, 0.5].map((v) => (
          <text
            key={v}
            x={px(v)}
            y={H - 8}
            fontSize="10"
            textAnchor="middle"
            fill="var(--color-muted)"
          >
            {v}
          </text>
        ))}
        <text
          x={W - 6}
          y={H - 8}
          fontSize="10"
          textAnchor="end"
          fill="var(--color-muted)"
        >
          1+
        </text>
      </svg>
      <p className="m-0 text-xs text-muted">
        Information value (IV), five equal-count bins. ★ = your guess. Bands: not useful
        below {IV_THRESHOLDS.notUseful}, weak to {IV_THRESHOLDS.weak}, medium to{' '}
        {IV_THRESHOLDS.medium}, strong to {IV_THRESHOLDS.strong}, suspicious above.
      </p>

      <div className="mt-3">
        <Toggle
          label="Add a feature that peeks at the future"
          checked={leak}
          onChange={setLeak}
        />
      </div>
      {leakRow && (
        <p
          className="m-0 mt-2 rounded-md border-l-4 border-neg bg-bg p-2 text-sm font-semibold"
          role="alert"
        >
          <span aria-hidden="true">⚠ </span>Too good to be true: it uses information from
          after the default. Check for leakage.
          <span className="block text-xs font-normal text-muted">
            *Collection calls only start once someone has already defaulted. IV{' '}
            {leakRow.iv.toFixed(1)} is {ivStrength(leakRow.iv)}.
          </span>
        </p>
      )}

      <p className="mb-0 mt-3 text-sm" role="status">
        {guess
          ? guessRank === 1
            ? `You picked ${FEATURES[guess].label}. Right: it ranks first with IV ${iv3(best.iv)} (${ivStrength(best.iv)}).`
            : `You picked ${FEATURES[guess].label}, which ranks ${guessRank} of ${honest.length} (IV ${iv3(honest[guessRank - 1]!.iv)}). The strongest is ${FEATURES[best.key].label} with IV ${iv3(best.iv)}.`
          : `The strongest feature here is ${FEATURES[best.key].label} (IV ${iv3(best.iv)}, ${ivStrength(best.iv)}). Make a guess at the top of the page to see how you did.`}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setLeak(false);
            pageActions.setFeature('bureau_score');
          }}
        >
          Reset
        </Button>
      </div>
    </>
  );
}

export function FeatureRanking() {
  return (
    <ClientOnly
      minHeight={820}
      label="Feature ranking: information value of each feature, with a leakage toggle"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
