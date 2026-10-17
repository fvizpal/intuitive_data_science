import { useEffect, useId, useMemo } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Slider } from '../../components/ui/Slider';
import { ChartKey, LegendItem, niceTicks } from '../sampling/charts';
import { curveSummary, errorsAt, type CurveSummary } from './bank';
import { Reading, Skeleton, fmtErr } from './charts';
import { NPILLS } from './FitTheCurve';
import { DEFAULT_N, capFor, pageActions, usePage, type Shape } from './store';
import { DEFAULT_NOISE } from './fit';
import { peekBank, useBank } from './useBank';

const W = 600;
const H = 376;
const L = 46;
const R = 14;
const T = 46;
const B = 82;
const PW = W - L - R;
const PH = H - T - B;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Lowest error at the cap, lowest at degree 1, or somewhere in between. */
export function shapeOf(s: CurveSummary): Shape {
  const cap = s.degrees.length;
  if (s.bestDegree === 1) return 'rises-first';
  if (s.bestDegree === cap) return 'keeps-falling';
  return 'falls-then-rises';
}

function Chart({
  s,
  degree,
  noise,
  hatch,
  clip,
}: {
  s: CurveSummary;
  degree: number;
  noise: number;
  hatch: string;
  clip: string;
}) {
  const cap = s.degrees.length;
  const bestTest = s.test[s.bestDegree - 1]!;
  const yMax = Math.max(10, 4 * bestTest);
  const x = (d: number) => L + 10 + ((d - 1) / Math.max(1, cap - 1)) * (PW - 20);
  const y = (v: number) => T + (1 - Math.min(v, yMax * 1.05) / yMax) * PH;
  const yTicks = niceTicks(0, yMax, 4);
  const line = (vals: number[]) =>
    vals.map((v, i) => `${i ? 'L' : 'M'}${r1(x(i + 1))} ${r1(y(v))}`).join('');
  const band =
    s.degrees.map((d, i) => `${i ? 'L' : 'M'}${r1(x(d))} ${r1(y(s.test[i]!))}`).join('') +
    [...s.degrees]
      .reverse()
      .map((d) => `L${r1(x(d))} ${r1(y(s.train[d - 1]!))}`)
      .join('') +
    'Z';
  const clipped = s.degrees.filter((d) => s.test[d - 1]! > yMax);
  const best = s.bestDegree;
  const bx = x(best);
  const by = y(bestTest);
  const left = bx < L + PW * 0.25;
  const gapDeg = Math.max(2, Math.min(cap, cap - 2));
  const step = (PW - 20) / Math.max(1, cap - 1);
  const flexStart = s.degrees.find((d) => d > best && s.test[d - 1]! > 1.5 * bestTest);
  const stiffX = best > 1 ? x(best) - step / 2 : null;
  const flexX = flexStart ? x(flexStart) - step / 2 : null;
  const zoneLabel = (cx: number, text: string) => (
    <text
      x={Math.max(L + 34, Math.min(W - R - 34, cx))}
      y={T - 16}
      fontSize="14"
      fontWeight="600"
      textAnchor="middle"
      fill="var(--color-muted)"
    >
      {text}
    </text>
  );

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full select-none"
      style={{ aspectRatio: `${W} / ${H}` }}
      role="img"
      aria-label={`Average training error and average error on new data against degree. Lowest error on new data at degree ${best}.`}
    >
      <defs>
        <clipPath id={clip}>
          <rect x={L} y={T} width={PW} height={PH} />
        </clipPath>
        <pattern
          id={hatch}
          width="7"
          height="7"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect
            width="7"
            height="7"
            fill="color-mix(in srgb, var(--color-neg) 12%, transparent)"
          />
          <line x1="0" y1="0" x2="0" y2="7" stroke="var(--color-neg)" strokeWidth="2" />
        </pattern>
      </defs>
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--color-grid)" />
          <text
            x={L - 6}
            y={y(t) + 5}
            fontSize="15"
            textAnchor="end"
            fill="var(--color-muted)"
          >
            {t}
          </text>
        </g>
      ))}
      <text x={L - 6} y={T - 10} fontSize="14" textAnchor="end" fill="var(--color-muted)">
        °C
      </text>
      {s.degrees.map((d) => (
        <text
          key={d}
          x={x(d)}
          y={T + PH + 20}
          fontSize="15"
          textAnchor="middle"
          fill="var(--color-muted)"
        >
          {d}
        </text>
      ))}
      <text
        x={W - R}
        y={T + PH + 62}
        fontSize="14"
        textAnchor="end"
        fill="var(--color-muted)"
      >
        degree (1 = straight line)
      </text>

      <g clipPath={`url(#${clip})`}>
        {stiffX !== null && (
          <rect
            x={L}
            y={T}
            width={stiffX - L}
            height={PH}
            fill="color-mix(in srgb, var(--color-accent) 7%, transparent)"
          />
        )}
        {flexX !== null && (
          <rect
            x={flexX}
            y={T}
            width={W - R - flexX}
            height={PH}
            fill="color-mix(in srgb, var(--color-neg) 7%, transparent)"
          />
        )}
        <path d={band} fill={`url(#${hatch})`} stroke="none" />
        <line
          x1={L}
          x2={W - R}
          y1={y(noise)}
          y2={y(noise)}
          stroke="var(--color-ink)"
          strokeWidth="1.6"
          strokeDasharray="2 5"
        />
        <path
          d={line(s.train)}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="2.4"
          strokeDasharray="8 4"
        />
        <path
          d={line(s.test)}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="3.4"
          strokeLinejoin="round"
        />
        {s.degrees.map((d) => (
          <g key={d}>
            <rect
              x={r1(x(d) - 4)}
              y={r1(y(s.train[d - 1]!) - 4)}
              width="8"
              height="8"
              fill="var(--color-surface)"
              stroke="var(--color-ink)"
              strokeWidth="2"
            />
            <circle
              cx={r1(x(d))}
              cy={r1(y(s.test[d - 1]!))}
              r="4.6"
              fill="var(--color-accent)"
              stroke="var(--color-surface)"
              strokeWidth="1.2"
            />
          </g>
        ))}
      </g>

      {stiffX !== null && zoneLabel((L + stiffX) / 2, 'Too stiff')}
      {flexX !== null && zoneLabel((flexX + W - R) / 2, 'Chasing noise')}
      {stiffX !== null && (
        <line
          x1={stiffX}
          x2={stiffX}
          y1={T - 30}
          y2={T + PH}
          stroke="var(--color-grid)"
          strokeDasharray="3 3"
        />
      )}
      {flexX !== null && (
        <line
          x1={flexX}
          x2={flexX}
          y1={T - 30}
          y2={T + PH}
          stroke="var(--color-grid)"
          strokeDasharray="3 3"
        />
      )}
      <text
        x={L + 8}
        y={Math.max(T + 18, y(s.test[0]!) - 14)}
        fontSize="14"
        fontWeight="600"
        fill="var(--color-accent)"
        stroke="var(--color-surface)"
        strokeWidth="4"
        paintOrder="stroke"
      >
        Error on new data
      </text>
      <text
        x={W - R - 4}
        y={Math.min(T + PH - 6, y(s.train[cap - 1]!) + 20)}
        fontSize="14"
        fontWeight="600"
        textAnchor="end"
        fill="var(--color-ink)"
        stroke="var(--color-surface)"
        strokeWidth="4"
        paintOrder="stroke"
      >
        Training error
      </text>
      <text
        x={W - R - 4}
        y={y(noise) - 5}
        fontSize="14"
        textAnchor="end"
        fill="var(--color-ink)"
        stroke="var(--color-surface)"
        strokeWidth="4"
        paintOrder="stroke"
      >
        Noise floor {noise.toFixed(1)}
      </text>
      <text
        x={x(gapDeg)}
        y={T + PH * 0.5}
        fontSize="14"
        textAnchor="middle"
        fill="var(--color-neg)"
        stroke="var(--color-surface)"
        strokeWidth="4"
        paintOrder="stroke"
      >
        Overfitting gap
      </text>

      {clipped.map((d) => (
        <g key={d}>
          <polygon
            points={`${x(d)},${T + 1} ${x(d) + 6},${T + 12} ${x(d) - 6},${T + 12}`}
            fill="var(--color-neg)"
            stroke="var(--color-surface)"
            strokeWidth="1"
          />
          <text
            x={x(d)}
            y={T + 26}
            fontSize="13"
            textAnchor="middle"
            fill="var(--color-neg)"
            stroke="var(--color-surface)"
            strokeWidth="4"
            paintOrder="stroke"
          >
            {fmtErr(s.test[d - 1]!)}
          </text>
        </g>
      ))}

      <line
        x1={bx}
        x2={bx}
        y1={by}
        y2={T + PH}
        stroke="var(--color-good)"
        strokeWidth="1.6"
        strokeDasharray="1 4"
        strokeLinecap="round"
      />
      <polygon
        points={`${bx},${by - 10} ${bx + 9},${by} ${bx},${by + 10} ${bx - 9},${by}`}
        fill="var(--color-surface)"
        stroke="var(--color-good)"
        strokeWidth="2.6"
      />
      <text
        x={left ? bx - 6 : bx}
        y={Math.max(T + 44, by - 18)}
        fontSize="15"
        fontWeight="600"
        textAnchor={left ? 'start' : 'middle'}
        fill="var(--color-ink)"
        stroke="var(--color-surface)"
        strokeWidth="4"
        paintOrder="stroke"
      >
        Sweet spot: degree {best}
      </text>

      <polygon
        points={`${x(degree)},${T + PH + 26} ${x(degree) + 7},${T + PH + 38} ${x(degree) - 7},${T + PH + 38}`}
        fill="var(--color-ink)"
      />
    </svg>
  );
}

function Inner() {
  const { seed, n, noiseSd, degree } = usePage();
  const bank = useBank(seed, n);
  const uid = useId().replace(/:/g, '');
  const cap = capFor(n);
  const summary = useMemo(
    () => (bank ? curveSummary(bank, noiseSd) : null),
    [bank, noiseSd],
  );
  const shape = summary ? shapeOf(summary) : null;
  useEffect(() => {
    if (shape) pageActions.setShape(shape);
  }, [shape]);

  if (!bank || !summary) return <Skeleton height={760} />;

  const best = summary.bestDegree;
  const bestTest = summary.test[best - 1]!;
  const limit = 3 * bestTest;
  const firstHigh = summary.degrees.find((d) => d > best && summary.test[d - 1]! > limit);
  const climb = firstHigh
    ? `Past degree ${firstHigh - 1} it climbs above ${limit >= 1000 ? '1000' : Math.round(limit)}.`
    : best === cap
      ? `It is still falling at degree ${cap}.`
      : 'It rises only slowly after that.';

  // Compare with the defaults using banks that are already built (never starts a build).
  const bank20 = n !== DEFAULT_N ? peekBank(seed, DEFAULT_N) : null;
  const best20 = bank20 ? curveSummary(bank20, noiseSd).bestDegree : null;
  const defNoise =
    noiseSd !== DEFAULT_NOISE ? curveSummary(bank, DEFAULT_NOISE).bestDegree : null;
  const bank200 = peekBank(seed, 200);
  const bank20b = peekBank(seed, 20);
  const stiff =
    bank200 && bank20b
      ? { a: errorsAt(bank20b, 1, noiseSd).test, b: errorsAt(bank200, 1, noiseSd).test }
      : null;

  const moved =
    best20 === null
      ? null
      : best === best20
        ? `With ${n} points the sweet spot stays at degree ${best}.`
        : n > DEFAULT_N
          ? `With ${n} points the sweet spot moves to degree ${best} (degree ${best20} with ${DEFAULT_N}): more data lets you afford more bends.`
          : `With ${n} points the sweet spot moves to degree ${best} (degree ${best20} with ${DEFAULT_N}): fewer points mean fewer bends you can afford.`;
  const noisy =
    defNoise === null
      ? null
      : defNoise === best
        ? `With noise ${noiseSd.toFixed(1)} the sweet spot stays at degree ${best}.`
        : `With noise ${noiseSd.toFixed(1)} the sweet spot is degree ${best} (degree ${defNoise} at noise ${DEFAULT_NOISE.toFixed(1)}). ${
            noiseSd > DEFAULT_NOISE
              ? 'More noise moves the sweet spot toward simpler curves.'
              : 'Less noise lets you afford more flexible curves.'
          }`;

  const tr = summary.train[degree - 1]!;
  const te = summary.test[degree - 1]!;
  const where =
    degree < best
      ? 'Too stiff: more bends would help.'
      : degree === best
        ? 'This is the sweet spot.'
        : te > 1.5 * bestTest
          ? 'Chasing noise: it looks good on its own dots and worse on fresh ones.'
          : 'A little past the sweet spot.';
  const yours = `Degree ${degree}: training error ${fmtErr(tr)}, error on new data ${fmtErr(te)}, gap ${fmtErr(te - tr)}. ${where}`;
  const text = `Degree ${degree} is marked. Lowest error on new data is at degree ${best}.`;

  return (
    <>
      <SegmentedControl
        label="Points to learn from"
        options={NPILLS}
        value={String(n)}
        onChange={(v) => pageActions.setN(Number(v))}
      />
      <ol className="m-0 mt-3 list-decimal pl-5 text-sm text-muted">
        <li>Each dot is one degree, from 1 (a straight line) to {cap} (very bendy).</li>
        <li>
          Dashed line: how well the curve fits the points it learned from. Solid line: how
          well it predicts fresh points.
        </li>
        <li>The lowest point of the solid line is the sweet spot.</li>
      </ol>
      <div className="mt-3">
        <Chart
          s={summary}
          degree={degree}
          noise={noiseSd}
          hatch={`gap${uid}`}
          clip={`cc${uid}`}
        />
        <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted">
          <LegendItem
            shape={
              <g>
                <line
                  x1="1"
                  x2="17"
                  y1="8"
                  y2="8"
                  stroke="var(--color-ink)"
                  strokeWidth="2.4"
                  strokeDasharray="5 3"
                />
                <rect
                  x="5"
                  y="4"
                  width="8"
                  height="8"
                  fill="var(--color-surface)"
                  stroke="var(--color-ink)"
                  strokeWidth="2"
                />
              </g>
            }
          >
            Training error (dashed, squares)
          </LegendItem>
          <LegendItem
            shape={
              <g>
                <line
                  x1="1"
                  x2="17"
                  y1="8"
                  y2="8"
                  stroke="var(--color-accent)"
                  strokeWidth="3.4"
                />
                <circle cx="9" cy="8" r="4.2" fill="var(--color-accent)" />
              </g>
            }
          >
            Error on new data (solid, circles)
          </LegendItem>
          <LegendItem
            shape={
              <line
                x1="1"
                x2="17"
                y1="8"
                y2="8"
                stroke="var(--color-ink)"
                strokeWidth="1.6"
                strokeDasharray="2 4"
              />
            }
          >
            Noise floor (dotted)
          </LegendItem>
          <LegendItem
            shape={
              <rect
                x="2"
                y="3"
                width="14"
                height="10"
                fill={`url(#gap${uid})`}
                stroke="var(--color-neg)"
                strokeWidth="1"
              />
            }
          >
            Overfitting gap: new-data error minus training error
          </LegendItem>
          <LegendItem
            shape={
              <polygon
                points="9,1 16,8 9,15 2,8"
                fill="var(--color-surface)"
                stroke="var(--color-good)"
                strokeWidth="2"
              />
            }
          >
            Sweet spot: lowest error on new data
          </LegendItem>
        </ul>
        <ChartKey
          across="degree (1 = straight line; higher = more bends). The ▲ under the axis is your degree"
          up="error in °C. Each dot averages 60 different sets of training points"
        />
      </div>

      <div className="mt-3">
        <Slider
          label="Your degree (moves the ▲)"
          value={degree}
          min={1}
          max={cap}
          step={1}
          onChange={pageActions.setDegree}
          format={String}
        />
        <p className="m-0 mt-1 text-sm">{yours}</p>
      </div>
      <div className="mt-3">
        <Slider
          label="Noise: how scattered the points are"
          value={noiseSd}
          min={0.5}
          max={4}
          step={0.1}
          onChange={pageActions.setNoise}
          format={(v) => `${v.toFixed(1)} °C`}
        />
      </div>

      <Reading>
        With {n} points, error on new data is lowest at degree {best} ({fmtErr(bestTest)}
        ). {climb}
        {moved && <> {moved}</>}
        {noisy && <> {noisy}</>}
        {stiff && (
          <>
            {' '}
            A stiff model stays stiff: at degree 1, error on new data is {fmtErr(
              stiff.a,
            )}{' '}
            with 20 points and {fmtErr(stiff.b)} with 200.
          </>
        )}
      </Reading>
      <p className="sr-only" aria-live="polite">
        {text}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={pageActions.newData}>New samples</Button>
        <Button onClick={pageActions.reset}>Reset</Button>
      </div>
    </>
  );
}

export function ComplexityCurve() {
  return (
    <ClientOnly
      minHeight={860}
      label="Complexity curve: training error and error on new data against degree"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
