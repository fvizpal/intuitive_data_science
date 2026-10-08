import { scaleLinear } from 'd3-scale';
import type { ThemeColors } from '../../lib/theme';
import { MAX_STEPS, MIN_LOSS, MIN_X, X_MAX, X_MIN, loss } from './gd';

/** Loss values above this are clipped to the top of the plot. */
export const LOSS_MAX = 28;
const PAD = { l: 40, r: 14, t: 14, b: 28 };
const FONT = '12px system-ui, -apple-system, "Segoe UI", sans-serif';

export function curveScales(w: number, h: number) {
  return {
    x: scaleLinear()
      .domain([X_MIN, X_MAX])
      .range([PAD.l, w - PAD.r]),
    y: scaleLinear()
      .domain([0, LOSS_MAX])
      .range([h - PAD.b, PAD.t]),
  };
}

/** Sizes the canvas backing store for devicePixelRatio and returns a CSS-pixel context. */
export function setupCanvas(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = FONT;
  return ctx;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function arrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 10) return;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const ang = Math.atan2(dy, dx);
  const head = 7;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(ang - 0.45), y2 - head * Math.sin(ang - 0.45));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(ang + 0.45), y2 - head * Math.sin(ang + 0.45));
  ctx.stroke();
}

function cross(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x - r, y - r);
  ctx.lineTo(x + r, y + r);
  ctx.moveTo(x + r, y - r);
  ctx.lineTo(x - r, y + r);
  ctx.stroke();
}

export function drawCurve(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  xs: number[],
  k: number,
  c: ThemeColors,
) {
  const { x, y } = curveScales(w, h);
  ctx.font = FONT;

  // Grid and axis labels
  ctx.strokeStyle = c.grid;
  ctx.fillStyle = c.muted;
  ctx.lineWidth = 1;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const v of [0, 10, 20]) {
    ctx.beginPath();
    ctx.moveTo(PAD.l, y(v));
    ctx.lineTo(w - PAD.r, y(v));
    ctx.stroke();
    ctx.fillText(String(v), PAD.l - 6, y(v));
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const v of [-2, 0, 2, 4, 6]) {
    ctx.fillText(String(v), x(v), h - PAD.b + 6);
  }
  ctx.textAlign = 'left';
  ctx.fillText('loss', 4, PAD.t - 2);

  // Minimum marker (dashed, labeled)
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = c.good;
  ctx.beginPath();
  ctx.moveTo(x(MIN_X), y(MIN_LOSS));
  ctx.lineTo(x(MIN_X), h - PAD.b);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = c.good;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('minimum', x(MIN_X) + 6, h - PAD.b - 4);

  // Loss curve
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const samples = 120;
  for (let i = 0; i <= samples; i++) {
    const vx = X_MIN + ((X_MAX - X_MIN) * i) / samples;
    const px = x(vx);
    const py = y(Math.min(loss(vx), LOSS_MAX));
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // Trail: arrows and fading dots
  const pos = (v: number) => ({
    px: x(clamp(v, X_MIN, X_MAX)),
    py: y(Math.min(loss(clamp(v, X_MIN, X_MAX)), LOSS_MAX)),
    out: v < X_MIN || v > X_MAX,
  });
  ctx.strokeStyle = c.accent;
  ctx.fillStyle = c.accent;
  ctx.lineWidth = 1.5;
  for (let i = 1; i <= k; i++) {
    const age = k - i;
    ctx.globalAlpha = Math.max(0.15, 1 - age / 10);
    const a = pos(xs[i - 1] as number);
    const b = pos(xs[i] as number);
    arrow(ctx, a.px, a.py, b.px, b.py);
  }
  for (let i = 0; i <= k; i++) {
    const age = k - i;
    ctx.globalAlpha = Math.max(0.15, 1 - age / 10);
    const p = pos(xs[i] as number);
    if (i === k) continue;
    if (p.out) {
      cross(ctx, p.px, p.py, 4);
    } else {
      ctx.beginPath();
      ctx.arc(p.px, p.py, i === 0 ? 4 : 3.5, 0, Math.PI * 2);
      if (i === 0) ctx.stroke();
      else ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // Current ball (circle) or escape marker (cross)
  const cur = pos(xs[k] as number);
  if (cur.out) {
    ctx.strokeStyle = c.bad;
    ctx.lineWidth = 3;
    cross(ctx, cur.px, cur.py, 7);
  } else {
    ctx.beginPath();
    ctx.arc(cur.px, cur.py, 8, 0, Math.PI * 2);
    ctx.fillStyle = c.accent;
    ctx.fill();
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Drag affordance on the untouched start point
  if (k === 0) {
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cur.px, cur.py, 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = c.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('drag me', cur.px, cur.py - 20);
  }
}

export function drawLossChart(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  xs: number[],
  k: number,
  c: ThemeColors,
) {
  const sx = scaleLinear()
    .domain([0, MAX_STEPS])
    .range([PAD.l, w - PAD.r]);
  const sy = scaleLinear()
    .domain([0, LOSS_MAX])
    .range([h - PAD.b, PAD.t]);
  ctx.font = FONT;

  ctx.strokeStyle = c.grid;
  ctx.fillStyle = c.muted;
  ctx.lineWidth = 1;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const v of [0, 10, 20]) {
    ctx.beginPath();
    ctx.moveTo(PAD.l, sy(v));
    ctx.lineTo(w - PAD.r, sy(v));
    ctx.stroke();
    ctx.fillText(String(v), PAD.l - 6, sy(v));
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const v of [0, 10, 20, 30, 40, 50]) {
    ctx.fillText(String(v), sx(v), h - PAD.b + 6);
  }
  ctx.textAlign = 'left';
  ctx.fillText('loss vs step', 4, PAD.t - 2);

  // Minimum loss, dashed
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = c.good;
  ctx.beginPath();
  ctx.moveTo(PAD.l, sy(MIN_LOSS));
  ctx.lineTo(w - PAD.r, sy(MIN_LOSS));
  ctx.stroke();
  ctx.restore();

  const pt = (i: number) => [
    sx(i),
    sy(Math.min(loss(clamp(xs[i] as number, -1e6, 1e6)), LOSS_MAX)),
  ];
  ctx.strokeStyle = c.accent;
  ctx.fillStyle = c.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= k; i++) {
    const [px, py] = pt(i) as [number, number];
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  for (let i = 0; i <= k; i++) {
    const [px, py] = pt(i) as [number, number];
    ctx.beginPath();
    ctx.arc(px, py, i === k ? 4.5 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
