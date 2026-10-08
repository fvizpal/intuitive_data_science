import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';
import { onThemeChange, readTheme } from '../../lib/theme';
import { curveScales, drawCurve, drawLossChart, setupCanvas } from './draw';
import {
  ETA_DEFAULT,
  ETA_MAX,
  ETA_MIN,
  STATUS_LABELS,
  X0_DEFAULT,
  X_MAX,
  X_MIN,
  classify,
  loss,
  simulate,
  snapEta,
} from './gd';

const SLOW_MS = 700;
const FAST_MS = 150;
const HIT_RADIUS = 24;
const CURVE_RATIO = 0.55;
const CHART_HEIGHT = 130;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clampX = (v: number) => Math.min(X_MAX, Math.max(X_MIN, v));
const fmtEta = (v: number) => String(Number(snapEta(v).toPrecision(3)));
const fmtLoss = (v: number) => (v >= 1000 ? v.toExponential(1) : v.toFixed(2));

export function LearningRateDemo() {
  const [eta, setEta] = useState(ETA_DEFAULT);
  const [x0, setX0] = useState(X0_DEFAULT);
  const [k, setK] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fast, setFast] = useState(false);
  const [width, setWidth] = useState(0);
  const [themeTick, setThemeTick] = useState(0);
  const [onScreen, setOnScreen] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);

  const rootRef = useRef<HTMLDivElement>(null);
  const curveRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);

  const run = useMemo(() => simulate(x0, eta), [x0, eta]);
  const last = run.xs.length - 1;
  const x = run.xs[k] as number;
  const status = classify(eta);
  const finished = k >= last;
  const running = playing && !finished;
  const curveHeight = Math.max(220, Math.round(width * CURVE_RATIO));

  /** Restart from step 0 with new parameters; autoplay unless the reader prefers reduced motion. */
  const restart = useCallback((nextX0: number, nextEta: number, autoplay = true) => {
    const reduced = prefersReducedMotion();
    setX0(nextX0);
    setEta(nextEta);
    if (reduced && autoplay) {
      setK(simulate(nextX0, nextEta).xs.length - 1);
      setPlaying(false);
    } else {
      setK(0);
      setPlaying(autoplay);
    }
  }, []);

  const togglePlay = () => {
    if (running) {
      setPlaying(false);
    } else if (prefersReducedMotion()) {
      setK(last);
    } else {
      if (finished) setK(0);
      setPlaying(true);
    }
  };

  const stepOnce = () => {
    setPlaying(false);
    setK((v) => Math.min(v + 1, last));
  };

  const reset = () => {
    setFast(false);
    setK(0);
    setPlaying(false);
    setX0(X0_DEFAULT);
    setEta(ETA_DEFAULT);
  };

  // Track container width.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.floor(el.clientWidth)));
    ro.observe(el);
    setWidth(Math.floor(el.clientWidth));
    return () => ro.disconnect();
  }, []);

  // Pause when scrolled off screen or the tab is hidden.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) =>
      setOnScreen(entry?.isIntersecting ?? true),
    );
    io.observe(el);
    const onVis = () => setTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  useEffect(() => onThemeChange(() => setThemeTick((t) => t + 1)), []);

  // Animation loop: advance one step per interval while playing and visible.
  useEffect(() => {
    if (!running || !onScreen || !tabVisible) return;
    const interval = fast ? FAST_MS : SLOW_MS;
    let raf = 0;
    let prev = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      acc += now - prev;
      prev = now;
      if (acc >= interval) {
        acc = 0;
        setK((v) => Math.min(v + 1, last));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, onScreen, tabVisible, fast, last]);

  // Draw.
  useEffect(() => {
    if (width === 0) return;
    const colors = readTheme();
    const curve = curveRef.current;
    const chart = chartRef.current;
    if (curve) {
      const ctx = setupCanvas(curve, width, curveHeight);
      if (ctx) drawCurve(ctx, width, curveHeight, run.xs, k, colors);
    }
    if (chart) {
      const ctx = setupCanvas(chart, width, CHART_HEIGHT);
      if (ctx) drawLossChart(ctx, width, CHART_HEIGHT, run.xs, k, colors);
    }
  }, [width, curveHeight, run, k, themeTick]);

  // Dragging the start point (mouse, touch, pen).
  const pointerToX = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return clampX(curveScales(width, curveHeight).x.invert(e.clientX - rect.left));
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (k !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const { x: sx, y: sy } = curveScales(width, curveHeight);
    const dx = e.clientX - rect.left - sx(x0);
    const dy = e.clientY - rect.top - sy(Math.min(loss(x0), 28));
    if (Math.hypot(dx, dy) > HIT_RADIUS) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    setPlaying(false);
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    setX0(pointerToX(e));
    setK(0);
  };

  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    restart(pointerToX(e), eta);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const delta = e.shiftKey ? 0.5 : 0.1;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      restart(clampX(x0 - delta), eta);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      restart(clampX(x0 + delta), eta);
    }
  };

  const summary = finished
    ? run.escaped
      ? `Left the plot after ${last} ${last === 1 ? 'step' : 'steps'}.`
      : `Finished ${last} ${last === 1 ? 'step' : 'steps'}: x = ${x.toFixed(3)}, loss = ${fmtLoss(loss(x))}.`
    : `Step ${k} of ${last}.`;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label="Gradient descent on a loss curve: change the learning rate and watch the steps"
      className="my-6 rounded-md border border-grid bg-surface p-3 sm:p-4"
    >
      <Slider
        label="Learning rate (η)"
        value={eta}
        min={ETA_MIN}
        max={ETA_MAX}
        log
        format={fmtEta}
        onChange={(v) => restart(x0, v)}
      />

      <canvas
        ref={curveRef}
        role="slider"
        tabIndex={0}
        aria-label="Starting position x. Use arrow keys to move it."
        aria-valuemin={X_MIN}
        aria-valuemax={X_MAX}
        aria-valuenow={Number(x0.toFixed(2))}
        aria-valuetext={`x = ${x0.toFixed(2)}`}
        style={{ width, height: curveHeight, touchAction: 'pan-y' }}
        className="mt-3 block max-w-full cursor-grab"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      />
      <canvas
        ref={chartRef}
        role="img"
        aria-label="Loss at each step so far"
        style={{ width, height: CHART_HEIGHT }}
        className="mt-2 block max-w-full"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={togglePlay} aria-pressed={running}>
          {running ? 'Pause' : finished ? 'Replay' : 'Play'}
        </Button>
        <Button onClick={stepOnce} disabled={finished}>
          Step
        </Button>
        <Button onClick={reset}>Reset</Button>
        <Toggle label="Fast steps" checked={fast} onChange={setFast} />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-muted">Step</dt>
          <dd className="m-0 font-mono font-semibold">
            {k} / {last}
          </dd>
        </div>
        <div>
          <dt className="text-muted">x</dt>
          <dd className="m-0 font-mono font-semibold">{x.toFixed(3)}</dd>
        </div>
        <div>
          <dt className="text-muted">Loss</dt>
          <dd className="m-0 font-mono font-semibold">{fmtLoss(loss(x))}</dd>
        </div>
      </dl>
      <p className="mb-0 mt-3 text-sm font-semibold">
        <span aria-hidden="true">
          {status === 'diverging' || status === 'stuck' ? '⚠ ' : '● '}
        </span>
        {STATUS_LABELS[status]}
        <span className="font-normal text-muted"> · {summary}</span>
      </p>
      <p role="status" className="sr-only">
        {finished ? `${STATUS_LABELS[status]}. ${summary}` : ''}
      </p>
    </div>
  );
}
