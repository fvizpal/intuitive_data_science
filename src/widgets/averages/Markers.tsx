/**
 * The marker identities used by every widget on this page, so a shape always means the
 * same thing: mean = triangle (the balance point), median = line with a diamond,
 * mode = star on the tallest stack. Colour is a bonus; the shape and label carry it.
 */

export const MEAN_COLOR = 'var(--color-accent)';
export const MEDIAN_COLOR = 'var(--color-ink)';
export const MODE_COLOR = 'var(--color-good)';

const r2 = (v: number) => Math.round(v * 100) / 100;

export function MeanMark({
  x,
  y,
  hollow = false,
}: {
  x: number;
  y: number;
  hollow?: boolean;
}) {
  return (
    <polygon
      points={`${r2(x)},${r2(y)} ${r2(x + 8)},${r2(y + 13)} ${r2(x - 8)},${r2(y + 13)}`}
      fill={hollow ? 'var(--color-bg)' : MEAN_COLOR}
      stroke={MEAN_COLOR}
      strokeWidth="2"
      strokeLinejoin="round"
    />
  );
}

export function MedianMark({
  x,
  top,
  bottom,
}: {
  x: number;
  top: number;
  bottom: number;
}) {
  return (
    <g>
      <line
        x1={r2(x)}
        x2={r2(x)}
        y1={r2(top)}
        y2={r2(bottom)}
        stroke={MEDIAN_COLOR}
        strokeWidth="2"
      />
      <polygon
        points={`${r2(x)},${r2(top - 7)} ${r2(x + 7)},${r2(top)} ${r2(x)},${r2(top + 7)} ${r2(x - 7)},${r2(top)}`}
        fill={MEDIAN_COLOR}
        stroke="var(--color-bg)"
        strokeWidth="1"
      />
    </g>
  );
}

export function ModeStar({ x, y }: { x: number; y: number }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 ? 3.6 : 8;
    return `${r2(x + rad * Math.cos(a))},${r2(y + rad * Math.sin(a))}`;
  }).join(' ');
  return (
    <polygon points={pts} fill={MODE_COLOR} stroke="var(--color-bg)" strokeWidth="1" />
  );
}

/** HTML legend, to sit under a plot. */
export function MarkerLegend({
  mean = true,
  median = true,
  mode = true,
}: {
  mean?: boolean;
  median?: boolean;
  mode?: boolean;
}) {
  return (
    <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {mean && (
        <span>
          <span style={{ color: MEAN_COLOR }} aria-hidden="true">
            ▲
          </span>{' '}
          mean (balance point)
        </span>
      )}
      {median && (
        <span>
          <span style={{ color: MEDIAN_COLOR }} aria-hidden="true">
            ◆
          </span>{' '}
          median (middle value)
        </span>
      )}
      {mode && (
        <span>
          <span style={{ color: MODE_COLOR }} aria-hidden="true">
            ★
          </span>{' '}
          mode (most common)
        </span>
      )}
    </p>
  );
}
