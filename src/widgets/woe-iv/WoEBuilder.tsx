import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { ClientOnly } from './ClientOnly';
import { FeaturePicker } from './FeaturePicker';
import { WoeBars } from './WoeBars';
import {
  FEATURES,
  READING_COLOR,
  READING_GLYPH,
  READING_TEXT,
  analyzeDefault,
  binLabel,
  fmtInt,
  pct,
  signed,
  woeReading,
} from './features';
import type { RankedKey } from './features';
import { getLoans, pageActions, usePage } from './store';

const KEYS: RankedKey[] = ['bureau_score', 'max_dpd_6m', 'years_in_business'];

const WHY = {
  safer: 'This bin holds a bigger share of the good customers than of the bad ones.',
  riskier: 'This bin holds a bigger share of the bad customers than of the good ones.',
  average:
    'Good and bad customers are in this bin in the same proportion, so it says nothing either way.',
} as const;

function ShareBar({
  title,
  share,
  max,
  detail,
  tone,
  mark,
}: {
  title: string;
  share: number;
  max: number;
  detail: string;
  tone: 'pos' | 'neg';
  mark: string;
}) {
  return (
    <div>
      <div className="flex justify-between gap-2 text-sm">
        <span>{title}</span>
        <span className="font-mono font-semibold">{pct(share)}</span>
      </div>
      <div className="mt-1 h-6 rounded-sm bg-bg">
        <div
          className="flex h-full items-center rounded-sm px-2 text-xs font-semibold text-bg transition-[width] duration-300"
          style={{
            width: `${Math.max(2, (share / max) * 100)}%`,
            background: `color-mix(in srgb, var(--color-${tone}) 62%, var(--color-muted))`,
          }}
        >
          {mark}
        </div>
      </div>
      <div className="mt-0.5 text-xs text-muted">{detail}</div>
    </div>
  );
}

function Inner() {
  const { seed, feature, bin } = usePage();
  const loans = getLoans(seed);
  const meta = FEATURES[feature];
  const { edges, bins } = useMemo(() => analyzeDefault(loans, feature), [loans, feature]);
  const shown = bins.filter((b) => b.count > 0);
  const sel = shown.find((b) => b.index === bin) ?? shown[0]!;
  const [tableOpen, setTableOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 640,
  );

  const totalGood = shown.reduce((s, b) => s + b.good, 0);
  const totalBad = shown.reduce((s, b) => s + b.bad, 0);
  const maxShare = Math.max(0.05, ...shown.flatMap((b) => [b.pctGood, b.pctBad]));
  const ratio = sel.pctBad > 0 ? sel.pctGood / sel.pctBad : 1;
  const reading = woeReading(sel.woe);
  const smoothed = sel.good === 0 || sel.bad === 0;
  const lab = binLabel(meta, edges, sel.index);

  return (
    <>
      <FeaturePicker keys={KEYS} value={feature} onChange={pageActions.setFeature} />
      <div className="mt-3">
        <SegmentedControl
          label="Bin"
          value={String(sel.index)}
          onChange={(v) => pageActions.setBin(Number(v))}
          options={shown.map((b) => ({
            value: String(b.index),
            label: binLabel(meta, edges, b.index),
          }))}
        />
      </div>

      <div className="mt-4 grid gap-3">
        <ShareBar
          title="Share of all good customers who are in this bin"
          share={sel.pctGood}
          max={maxShare}
          tone="pos"
          mark="✓ good"
          detail={`${fmtInt(sel.good)} of the ${fmtInt(totalGood)} who repaid`}
        />
        <ShareBar
          title="Share of all bad customers who are in this bin"
          share={sel.pctBad}
          max={maxShare}
          tone="neg"
          mark="✗ bad"
          detail={`${fmtInt(sel.bad)} of the ${fmtInt(totalBad)} who defaulted`}
        />
      </div>

      <ol className="m-0 mt-4 grid list-none gap-2 p-0 text-sm sm:grid-cols-3">
        <li className="rounded-md border border-grid bg-bg p-2">
          <div className="text-xs text-muted">Step 1: compare the shares</div>
          <div className="font-mono">
            {pct(sel.pctGood)} ÷ {pct(sel.pctBad)} = <strong>{ratio.toFixed(2)}</strong>
          </div>
        </li>
        <li className="rounded-md border border-grid bg-bg p-2">
          <div className="text-xs text-muted">Step 2: take the natural log</div>
          <div className="font-mono">
            ln({ratio.toFixed(2)}) = <strong>{signed(sel.woe)}</strong>
          </div>
        </li>
        <li
          className="rounded-md border border-grid bg-bg p-2"
          style={{ borderColor: READING_COLOR[reading] }}
        >
          <div className="text-xs text-muted">Step 3: that is the WoE</div>
          <div
            className="font-mono text-2xl font-semibold"
            style={{ color: READING_COLOR[reading] }}
          >
            {signed(sel.woe)}
          </div>
          <div className="font-semibold">
            <span aria-hidden="true">{READING_GLYPH[reading]} </span>
            {READING_TEXT[reading]}
          </div>
        </li>
      </ol>
      <p className="m-0 mt-2 text-sm text-muted">
        {WHY[reading]}
        {smoothed &&
          ' This bin has no goods or no bads, so we add half a customer to keep the maths finite.'}
      </p>

      <h4 className="mb-1 mt-4 text-sm font-semibold">WoE of every bin</h4>
      <WoeBars
        bins={bins}
        edges={edges}
        meta={meta}
        selected={sel.index}
        onSelect={pageActions.setBin}
        label={`Weight of evidence of each ${meta.label} bin`}
      />

      <details
        className="mt-3 text-sm"
        open={tableOpen}
        onToggle={(e) => setTableOpen(e.currentTarget.open)}
      >
        <summary className="cursor-pointer font-semibold">Table of all bins</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="text-left text-muted">
                {['Bin', 'Good', 'Bad', '%Good', '%Bad', 'WoE'].map((h) => (
                  <th key={h} className="py-1 pr-2 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((b) => {
                const r = woeReading(b.woe);
                return (
                  <tr
                    key={b.index}
                    className={`border-t border-grid ${b.index === sel.index ? 'bg-bg font-semibold' : ''}`}
                  >
                    <td className="py-1 pr-2">{binLabel(meta, edges, b.index)}</td>
                    <td className="pr-2 font-mono">{fmtInt(b.good)}</td>
                    <td className="pr-2 font-mono">{fmtInt(b.bad)}</td>
                    <td className="pr-2 font-mono">{pct(b.pctGood)}</td>
                    <td className="pr-2 font-mono">{pct(b.pctBad)}</td>
                    <td className="pr-2 font-mono" style={{ color: READING_COLOR[r] }}>
                      {READING_GLYPH[r]} {signed(b.woe)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => pageActions.setFeature('bureau_score')}>Reset</Button>
      </div>
      <p role="status" className="sr-only">
        {meta.label}, bin {lab}: {pct(sel.pctGood)} of goods, {pct(sel.pctBad)} of bads,
        WoE {signed(sel.woe)}. {READING_TEXT[reading]}.
      </p>
    </>
  );
}

export function WoEBuilder() {
  return (
    <ClientOnly
      minHeight={900}
      label="Weight of evidence builder: compare the share of good and bad customers in a bin"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
