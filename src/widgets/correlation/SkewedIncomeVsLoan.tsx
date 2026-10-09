import { useEffect, useMemo, useRef, useState } from 'react';
import { scaleLinear, scaleLog } from 'd3-scale';
import { Button } from '../../components/ui/Button';
import { Metric } from '../../components/ui/Metric';
import { Toggle } from '../../components/ui/Toggle';
import { setupCanvas } from '../../lib/canvas';
import { onThemeChange, readTheme } from '../../lib/theme';
import type { ThemeColors } from '../../lib/theme';
import { fmt, pearson, spearman } from './corr';
import { incomeLoan, INCOME_N, rupees } from './data';

const SEED_DEFAULT = 4;
const RATIO = 0.72;
const PAD = { l: 52, r: 12, t: 12, b: 40 };

function draw(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  income: number[],
  loan: number[],
  log: boolean,
  c: ThemeColors,
) {
  const [x0, x1] = [Math.min(...income), Math.max(...income)];
  const [y0, y1] = [Math.min(...loan), Math.max(...loan)];
  const rx = [PAD.l, w - PAD.r];
  const ry = [h - PAD.b, PAD.t];
  const sx = log
    ? scaleLog()
        .domain([x0 / 1.2, x1 * 1.2])
        .range(rx)
    : scaleLinear()
        .domain([0, x1 * 1.03])
        .range(rx);
  const sy = log
    ? scaleLog()
        .domain([y0 / 1.2, y1 * 1.2])
        .range(ry)
    : scaleLinear()
        .domain([0, y1 * 1.03])
        .range(ry);
  const ticks = (s: typeof sx) =>
    log ? s.ticks().filter((v) => Math.abs(Math.log10(v) % 1) < 1e-9) : s.ticks(4);

  ctx.lineWidth = 1;
  ctx.strokeStyle = c.grid;
  ctx.fillStyle = c.muted;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const v of ticks(sx)) {
    ctx.beginPath();
    ctx.moveTo(sx(v), PAD.t);
    ctx.lineTo(sx(v), h - PAD.b);
    ctx.stroke();
    ctx.fillText(rupees(v), sx(v), h - PAD.b + 4);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const v of ticks(sy)) {
    ctx.beginPath();
    ctx.moveTo(PAD.l, sy(v));
    ctx.lineTo(w - PAD.r, sy(v));
    ctx.stroke();
    ctx.fillText(rupees(v), PAD.l - 4, sy(v));
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(
    `Monthly income →${log ? ' (log scale)' : ''}`,
    (PAD.l + w - PAD.r) / 2,
    h - 2,
  );
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`↑ Loan amount${log ? ' (log)' : ''}`, PAD.l + 4, PAD.t + 2);

  ctx.fillStyle = c.accent;
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < income.length; i++) {
    ctx.beginPath();
    ctx.arc(sx(income[i]!), sy(loan[i]!), 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function SkewedIncomeVsLoan() {
  const [log, setLog] = useState(false);
  const [seed, setSeed] = useState(SEED_DEFAULT);
  const [width, setWidth] = useState(0);
  const [themeTick, setThemeTick] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { income, loan } = useMemo(() => incomeLoan(seed), [seed]);
  const stats = useMemo(() => {
    const li = income.map(Math.log);
    const ll = loan.map(Math.log);
    return {
      raw: pearson(income, loan),
      logged: pearson(li, ll),
      rho: spearman(income, loan),
      top: income.filter((v) => v >= 250_000).length,
    };
  }, [income, loan]);
  const r = log ? stats.logged : stats.raw;
  const height = Math.round(width * RATIO);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.floor(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => onThemeChange(() => setThemeTick((t) => t + 1)), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;
    const ctx = setupCanvas(canvas, width, height);
    if (ctx) draw(ctx, width, height, income, loan, log, readTheme());
  }, [width, height, income, loan, log, themeTick]);

  const caption = log
    ? 'On a log scale the long tail is pulled in and the cloud is close to a straight line, so Pearson climbs toward Spearman. Spearman did not move: taking logs never changes the order.'
    : `On the raw scale ${stats.top} high earners stretch far to the right, and their capped loans drag the line around. Pearson is distorted by those few points; Spearman only sees the order.`;

  return (
    <div
      role="group"
      aria-label={`Monthly income versus loan amount for ${INCOME_N} mock borrowers, with a log-scale toggle`}
      className="my-6 rounded-md border border-grid bg-surface p-3 sm:p-4"
    >
      <Toggle label="Log scale" checked={log} onChange={setLog} />
      <div
        ref={boxRef}
        className="relative mt-2 w-full"
        style={{ aspectRatio: `1 / ${RATIO}` }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Scatter of income against loan amount, ${log ? 'log' : 'raw'} scale`}
          className="absolute inset-0 block h-full w-full"
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric
          label={`Pearson r (${log ? 'log' : 'raw'})`}
          value={fmt(r)}
          tone="accent"
          hint={log ? `raw: ${fmt(stats.raw)}` : `log: ${fmt(stats.logged)}`}
        />
        <Metric label="Spearman ρ" value={fmt(stats.rho)} hint="same on both scales" />
      </div>
      <p className="mb-0 mt-3 min-h-16 text-sm">{caption}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setLog(false);
            setSeed(SEED_DEFAULT);
          }}
        >
          Reset
        </Button>
        <Button onClick={() => setSeed((s) => s + 1)}>Reshuffle data</Button>
      </div>
      <p role="status" className="sr-only">
        {log ? 'Log' : 'Raw'} scale: Pearson {fmt(r)}, Spearman {fmt(stats.rho)}.
      </p>
    </div>
  );
}
