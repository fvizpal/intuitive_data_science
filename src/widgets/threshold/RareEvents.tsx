import { useEffect, useMemo } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Metric } from '../../components/ui/Metric';
import { Slider } from '../../components/ui/Slider';
import { count, pct } from './charts';
import { pageActions, usePage } from './store';
import { naturalFrequencies, precisionAt } from './threshold';

// Dot grid: 25 rows; the flagged block and the rest are separated by one empty column.
const ROWS = 25;
const COLS = 43;
const GW = 600;
const CELL = (GW - 16) / COLS;
const GTOP = 38;
const GH = GTOP + ROWS * CELL + 8;

const circle = (cx: number, cy: number, r: number) =>
  `M${(cx - r).toFixed(1)} ${cy.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

interface Dots {
  caught: string;
  missed: string;
  fa: string;
  faX: string;
  passed: string;
  flaggedCols: number;
  restStart: number;
}

function layout(d: {
  caught: number;
  missed: number;
  falseAlarms: number;
  passed: number;
}): Dots {
  const flagged = d.caught + d.falseAlarms;
  const flaggedCols = Math.ceil(flagged / ROWS);
  const restStart = flaggedCols + 1;
  const pos = (k: number, start: number) => ({
    cx: 8 + (start + Math.floor(k / ROWS) + 0.5) * CELL,
    cy: GTOP + ((k % ROWS) + 0.5) * CELL,
  });
  const out = { caught: '', missed: '', fa: '', faX: '', passed: '' };
  let k = 0;
  for (let i = 0; i < d.caught; i++, k++) {
    const p = pos(k, 0);
    out.caught += circle(p.cx, p.cy, 4.8);
  }
  for (let i = 0; i < d.falseAlarms; i++, k++) {
    const p = pos(k, 0);
    out.fa += circle(p.cx, p.cy, 4.8);
    out.faX += `M${(p.cx - 2.3).toFixed(1)} ${(p.cy - 2.3).toFixed(1)}l4.6 4.6M${(p.cx + 2.3).toFixed(1)} ${(p.cy - 2.3).toFixed(1)}l-4.6 4.6`;
  }
  k = 0;
  for (let i = 0; i < d.missed; i++, k++) {
    const p = pos(k, restStart);
    out.missed += circle(p.cx, p.cy, 4.2);
  }
  for (let i = 0; i < d.passed; i++, k++) {
    const p = pos(k, restStart);
    out.passed += circle(p.cx, p.cy, 2.6);
  }
  return { ...out, flaggedCols, restStart };
}

// Precision against share of spam (log axis, 0.5% to 50%).
const CW = 600;
const CH = 250;
const CPAD = { l: 48, r: 16 };
const CTOP = 22;
const CBASE = 196;
const LO = Math.log(0.005);
const HI = Math.log(0.5);
const cx = (share: number) =>
  CPAD.l + ((Math.log(share) - LO) / (HI - LO)) * (CW - CPAD.l - CPAD.r);
const cy = (v: number) => CBASE - v * (CBASE - CTOP);

function Inner() {
  const { rare } = usePage();
  const { share, recall, falseAlarmRate } = rare;
  useEffect(() => pageActions.markRareSeen(), []);

  const f = useMemo(
    () => naturalFrequencies({ n: 1000, prevalence: share, recall, falseAlarmRate }),
    [share, recall, falseAlarmRate],
  );
  const d = f.dots;
  const dots = useMemo(() => layout(f.dots), [f]);

  const flagged = d.caught + d.falseAlarms;
  const spam = d.caught + d.missed;
  const good = d.falseAlarms + d.passed;
  const precision = flagged > 0 ? d.caught / flagged : null;
  const accuracy = (d.caught + d.passed) / 1000;

  const curve = useMemo(() => {
    let path = '';
    for (let i = 0; i <= 80; i++) {
      const s = Math.exp(LO + ((HI - LO) * i) / 80);
      const p = precisionAt(s, recall, falseAlarmRate);
      if (p === null) continue;
      path += `${path ? 'L' : 'M'}${cx(s).toFixed(1)} ${cy(p).toFixed(1)}`;
    }
    return path;
  }, [recall, falseAlarmRate]);

  const p50 = precisionAt(0.5, recall, falseAlarmRate);
  const p1 = precisionAt(0.01, recall, falseAlarmRate);

  const parts: string[] = [];
  if (precision === null) {
    parts.push(
      `This filter is ${pct(accuracy)} accurate, but it flags nothing, so precision is undefined.`,
    );
  } else {
    parts.push(
      `This filter is ${pct(accuracy)} accurate${precision < accuracy ? ', yet only' : ' and'} ${pct(precision)} of flagged mail is spam.`,
    );
    if (Math.abs(share - 0.5) > 1e-9) {
      parts.push(`At 50% spam, the same filter's flags are ${pct(p50)} right.`);
    }
    if (Math.abs(share - 0.01) > 1e-9) parts.push(`At 1%, ${pct(p1)}.`);
    if (precision < 0.5) parts.push('Most of what it flags is good mail.');
  }
  const summary = `Of 1000 emails: ${spam} spam, ${d.caught} caught, ${d.falseAlarms} false alarms, precision ${pct(precision)}.`;

  const set = (patch: Partial<typeof rare>) => pageActions.setRare(patch);
  const round3 = (v: number) => Math.round(v * 1000) / 1000;
  const here = Math.min(0.5, Math.max(0.005, share));

  return (
    <>
      <svg
        viewBox={`0 0 ${GW} ${GH}`}
        className="block w-full select-none"
        role="img"
        aria-label={`1000 dots, one per email: ${d.caught} caught spam, ${d.missed} missed spam, ${d.falseAlarms} false alarms, ${d.passed} correctly passed`}
      >
        <text x="8" y="22" fontSize="17" fontWeight="600" fill="var(--color-accent)">
          Flagged: {flagged}
        </text>
        <text x={GW - 8} y="22" textAnchor="end" fontSize="17" fill="var(--color-muted)">
          Not flagged: {1000 - flagged}
        </text>
        <line
          x1="8"
          x2={8 + dots.flaggedCols * CELL - 2}
          y1="29"
          y2="29"
          stroke="var(--color-accent)"
          strokeWidth="2.5"
        />
        <line
          x1={8 + dots.restStart * CELL}
          x2={8 + (dots.restStart + Math.ceil((1000 - flagged) / ROWS)) * CELL - 2}
          y1="29"
          y2="29"
          stroke="var(--color-grid)"
          strokeWidth="2.5"
        />
        <path
          d={dots.passed}
          fill="color-mix(in srgb, var(--color-muted) 55%, transparent)"
        />
        <path
          d={dots.missed}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.8"
        />
        <path d={dots.caught} fill="var(--color-accent)" />
        <path d={dots.fa} fill="var(--color-neg)" />
        <path d={dots.faX} fill="none" stroke="var(--color-surface)" strokeWidth="1.5" />
      </svg>

      <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs">
        <li className="flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden="true">
            <circle cx="7" cy="7" r="5.5" fill="var(--color-accent)" />
          </svg>
          Caught spam
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden="true">
            <circle
              cx="7"
              cy="7"
              r="5"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="1.8"
            />
          </svg>
          Missed spam
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden="true">
            <circle cx="7" cy="7" r="5.5" fill="var(--color-neg)" />
            <path
              d="M4.5 4.5l5 5M9.5 4.5l-5 5"
              stroke="var(--color-surface)"
              strokeWidth="1.5"
            />
          </svg>
          False alarm
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden="true">
            <circle
              cx="7"
              cy="7"
              r="3"
              fill="color-mix(in srgb, var(--color-muted) 55%, transparent)"
            />
          </svg>
          Correctly passed
        </li>
      </ul>

      <div className="mt-3 flex flex-col gap-3">
        <Slider
          label="Share of mail that is spam"
          value={share}
          min={0.01}
          max={0.5}
          step={0.005}
          onChange={(v) => set({ share: round3(v) })}
          format={pct}
        />
        <Slider
          label="Spam it catches (recall)"
          value={recall}
          min={0.5}
          max={0.99}
          step={0.01}
          onChange={(v) => set({ recall: round3(v) })}
          format={pct}
        />
        <Slider
          label="Good mail it wrongly flags (false alarm rate)"
          value={falseAlarmRate}
          min={0.005}
          max={0.2}
          step={0.005}
          onChange={(v) => set({ falseAlarmRate: round3(v) })}
          format={pct}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button aria-pressed={share === 0.04} onClick={() => set({ share: 0.04 })}>
          Spam is rare (4%)
        </Button>
        <Button aria-pressed={share === 0.5} onClick={() => set({ share: 0.5 })}>
          Spam is common (50%)
        </Button>
        <Button aria-pressed={share === 0.01} onClick={() => set({ share: 0.01 })}>
          Very rare (1%)
        </Button>
        <Button onClick={pageActions.resetRare}>Reset</Button>
      </div>

      <p className="m-0 mt-3 text-sm">
        Of 1000 emails: <strong>{count(spam)}</strong> are spam, {count(d.caught)} caught,{' '}
        {count(d.missed)} missed. {count(good)} are good, {count(d.falseAlarms)} wrongly
        flagged. Flagged: {count(flagged)}. Really spam: {count(d.caught)}.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[3fr_2fr]">
        <Metric
          large
          label="Of flagged emails, really spam"
          value={pct(precision)}
          hint={
            precision === null
              ? 'Nothing flagged, so precision is undefined'
              : `${count(d.caught)} of ${count(flagged)} flagged emails`
          }
          tone="accent"
          wrap
        />
        <Metric
          large
          label="Accuracy"
          value={pct(accuracy)}
          hint={`${Math.round(accuracy * 100)} of every 100 emails sorted correctly`}
          wrap
        />
      </div>

      <p className="m-0 mt-3 text-sm font-semibold" role="status">
        <span className="text-muted">What you&apos;re seeing: </span>
        {parts.join(' ')}
      </p>

      <svg
        viewBox={`0 0 ${CW} ${CH}`}
        className="mt-3 block w-full select-none"
        role="img"
        aria-label="Precision against the share of mail that is spam, for this filter"
      >
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line
              x1={CPAD.l}
              x2={CW - CPAD.r}
              y1={cy(v)}
              y2={cy(v)}
              stroke="var(--color-grid)"
            />
            <text
              x={CPAD.l - 6}
              y={cy(v) + 6}
              textAnchor="end"
              fontSize="16"
              fill="var(--color-muted)"
            >
              {v * 100}%
            </text>
          </g>
        ))}
        <text x={CPAD.l - 38} y={14} fontSize="16" fill="var(--color-muted)">
          flagged mail that is really spam (precision)
        </text>
        {[0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5].map((s) => (
          <g key={s}>
            <line
              x1={cx(s)}
              x2={cx(s)}
              y1={CBASE}
              y2={CBASE + 4}
              stroke="var(--color-grid)"
            />
            <text
              x={cx(s)}
              y={CBASE + 22}
              textAnchor="middle"
              fontSize="16"
              fill="var(--color-muted)"
            >
              {pct(s)}
            </text>
          </g>
        ))}
        <text
          x={CW - CPAD.r}
          y={CBASE + 44}
          textAnchor="end"
          fontSize="16"
          fill="var(--color-muted)"
        >
          share of mail that is spam (log scale)
        </text>
        <path d={curve} fill="none" stroke="var(--color-muted)" strokeWidth="3" />
        {precision !== null && (
          <>
            <line
              x1={cx(here)}
              x2={cx(here)}
              y1={cy(precision)}
              y2={CBASE}
              stroke="var(--color-ink)"
              strokeDasharray="2 4"
            />
            <circle
              cx={cx(here)}
              cy={cy(precision)}
              r="9"
              fill="var(--color-ink)"
              stroke="var(--color-surface)"
              strokeWidth="2.5"
            />
            <text
              x={cx(here) + (here > 0.25 ? -14 : 14)}
              y={cy(precision) - 12}
              textAnchor={here > 0.25 ? 'end' : 'start'}
              fontSize="17"
              fontWeight="600"
              fill="var(--color-ink)"
            >
              {pct(precision)} at {pct(share)} spam
            </text>
          </>
        )}
      </svg>
      <p className="sr-only" role="status">
        {summary}
      </p>
    </>
  );
}

export function RareEvents() {
  return (
    <ClientOnly
      minHeight={1150}
      label="1000 emails as dots: how the share of spam changes what flagged mail means"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
