import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ClientOnly } from '../../components/ui/ClientOnly';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';
import { MarkerLegend, MeanMark, MedianMark } from '../averages/Markers';
import { histogramPeaks, mean, median } from '../averages/stats';
import { SIZE_MAX, SIZE_MIN, chestSample } from './data';
import { W, f0, f1 } from './charts';
import { binQuality, binReading, histogram, suggestedBinWidth } from './dist';
import { pageActions, usePage } from './store';

const H = 270;
const L = 44;
const R = W - 14;
const TOP = 34;
const AXIS_Y = 208;
const MIN_W = 1;
const MAX_W = 40;
const DEFAULT_W = 4;
const x = (v: number) => L + ((v - SIZE_MIN) / (SIZE_MAX - SIZE_MIN)) * (R - L);

function Inner() {
  const { seed } = usePage();
  const [width, setWidth] = useState(DEFAULT_W);
  const [rug, setRug] = useState(true);

  const values = useMemo(() => chestSample(seed), [seed]);
  const suggested = useMemo(() => suggestedBinWidth(values), [values]);
  const hist = useMemo(
    () => histogram(values, { binWidth: width, min: SIZE_MIN, max: SIZE_MAX })!,
    [values, width],
  );
  const m = useMemo(() => mean(values), [values]);
  const med = useMemo(() => median(values), [values]);

  const counts = hist.bins.map((b) => b.count);
  const nBins = counts.length;
  const top = Math.max(1, ...counts);
  const quality = binQuality(nBins);
  const peaks = histogramPeaks(counts, 1, 0.3).length;
  const caption =
    quality === 'fine'
      ? 'Noise looks like pattern.'
      : quality === 'coarse'
        ? 'The two groups blur into one lump.'
        : peaks >= 2
          ? 'Two groups are visible.'
          : 'The two groups are starting to blur.';
  const reading = binReading(nBins);
  const summary = `Bin width ${f1(width)}. ${reading}. ${caption}`;
  const sugPos =
    suggested === null
      ? null
      : Math.min(1, Math.max(0, Math.log(suggested / MIN_W) / Math.log(MAX_W / MIN_W)));

  const barBottom = AXIS_Y;
  const barH = (c: number) => (c / top) * (AXIS_Y - TOP - 6);
  const ticks = [50, 60, 70, 80, 90, 100, 110, 120, 130];

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full select-none"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={`Histogram of ${values.length} chest sizes in ${nBins} bins. ${caption}`}
      >
        <text x="6" y="14" fontSize="17" fill="var(--color-muted)">
          number of values per bin (tallest = {top})
        </text>
        {hist.bins.map((b, i) => {
          const w = Math.max(
            0,
            x(Math.min(b.x1, SIZE_MAX)) - x(b.x0) - (nBins > 60 ? 0 : 1),
          );
          return (
            <rect
              key={i}
              x={x(b.x0)}
              y={barBottom - barH(b.count)}
              width={w}
              height={barH(b.count)}
              fill="color-mix(in srgb, var(--color-accent) 50%, transparent)"
              stroke="var(--color-accent)"
              strokeWidth={nBins > 60 ? 0 : 1}
            />
          );
        })}
        <line x1={L} x2={R} y1={AXIS_Y} y2={AXIS_Y} stroke="var(--color-grid)" />
        {ticks.map((t) => (
          <text
            key={t}
            x={x(t)}
            y={AXIS_Y + 20}
            fontSize="17"
            textAnchor="middle"
            fill="var(--color-muted)"
          >
            {t}
          </text>
        ))}
        <text x={R} y={H - 6} fontSize="17" textAnchor="end" fill="var(--color-muted)">
          Chest size, cm
        </text>
        {rug &&
          values.map((v, i) => (
            <line
              key={i}
              x1={x(v)}
              x2={x(v)}
              y1={AXIS_Y + 28}
              y2={AXIS_Y + 38}
              stroke="var(--color-ink)"
              strokeOpacity="0.35"
            />
          ))}
        <MedianMark x={x(med)} top={TOP - 4} bottom={AXIS_Y} />
        <MeanMark x={x(m)} y={TOP - 6} />
      </svg>
      <MarkerLegend mode={false} />

      <div className="mt-3">
        <Slider
          label="Bin width (cm)"
          value={width}
          min={MIN_W}
          max={MAX_W}
          log
          onChange={setWidth}
          format={f1}
        />
        {sugPos !== null && (
          <div className="relative mx-[6px] h-4" aria-hidden="true">
            <span
              className="absolute -translate-x-1/2 text-xs text-accent"
              style={{ left: `${sugPos * 100}%` }}
            >
              ▲ rule of thumb
            </span>
          </div>
        )}
      </div>
      <p className="m-0 mt-1 text-sm font-semibold">{reading}</p>
      <p className="m-0 text-sm">{caption}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={suggested === null}
          onClick={() => suggested !== null && setWidth(suggested)}
        >
          Suggest a width
        </Button>
        <span className="text-xs text-muted">
          {suggested === null
            ? ''
            : `A common rule of thumb: ${f1(suggested)} wide, ${f0(Math.ceil((SIZE_MAX - SIZE_MIN) / suggested))} bins.`}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Toggle label="Show every value" checked={rug} onChange={setRug} />
        <Button
          onClick={() => {
            setWidth(DEFAULT_W);
            setRug(true);
            pageActions.resetSeed();
          }}
        >
          Reset
        </Button>
        <Button onClick={pageActions.reshuffle}>Reshuffle data</Button>
      </div>
      <p className="sr-only" role="status">
        {summary}
      </p>
    </>
  );
}

export function BinWidthLab() {
  return (
    <ClientOnly
      minHeight={480}
      label="Bin width lab: change the bin width and watch the histogram go from noisy to blurred"
    >
      {() => <Inner />}
    </ClientOnly>
  );
}
