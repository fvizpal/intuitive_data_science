export const CANVAS_FONT = '12px system-ui, -apple-system, "Segoe UI", sans-serif';

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
  ctx.font = CANVAS_FONT;
  return ctx;
}
