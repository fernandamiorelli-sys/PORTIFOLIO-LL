// Data overlay: o desenho de rastreamento por cima das imagens (caixas, marcadores, coordenadas,
// curvas tracejadas com setas), como nos vídeos de motion tracking e no anúncio Telemetria.
// Tudo em px CSS; o contexto já vem escalado pelo devicePixelRatio.

export const INK = 'rgba(240, 236, 226, 0.9)';
export const INK_DIM = 'rgba(240, 236, 226, 0.55)';
const FONT = '10px "Courier Prime", "Courier New", monospace';

export function prepare(ctx: CanvasRenderingContext2D, dpr: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineWidth = 1;
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.font = FONT;
  ctx.textBaseline = 'alphabetic';
  ctx.setLineDash([]);
}

/** acerta a linha no meio do pixel (traço de 1 px nítido) */
const px = (v: number) => Math.round(v) + 0.5;

export function label(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, align: CanvasTextAlign = 'left') {
  ctx.textAlign = align;
  ctx.fillText(text, Math.round(x), Math.round(y));
  ctx.textAlign = 'left';
}

/** caixa de rastreamento: retângulo fino, cantos reforçados e rótulos opcionais em cima e embaixo */
export function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, opts: { ticks?: number; top?: string; bottom?: string; dim?: boolean } = {}) {
  ctx.strokeStyle = opts.dim ? INK_DIM : INK;
  ctx.strokeRect(px(x), px(y), Math.round(w), Math.round(h));
  const t = opts.ticks ?? 0;
  if (t > 0) {
    ctx.lineWidth = 2;
    ctx.beginPath();
    const c = [
      [x, y, 1, 1],
      [x + w, y, -1, 1],
      [x, y + h, 1, -1],
      [x + w, y + h, -1, -1],
    ];
    for (const [cx, cy, sx, sy] of c) {
      ctx.moveTo(cx, cy + sy * t);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + sx * t, cy);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  ctx.fillStyle = opts.dim ? INK_DIM : INK;
  if (opts.top) label(ctx, x + 3, y - 4, opts.top);
  if (opts.bottom) label(ctx, x + w, y + h + 11, opts.bottom, 'right');
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
}

/** ponto rastreado: quadradinho com um traço dentro e a coordenada ao lado */
export function marker(ctx: CanvasRenderingContext2D, x: number, y: number, size = 7, text?: string, side: 1 | -1 = 1) {
  const s = size;
  ctx.strokeRect(px(x - s / 2), px(y - s / 2), s, s);
  ctx.beginPath();
  ctx.moveTo(px(x - s * 0.18), px(y + s * 0.22));
  ctx.lineTo(px(x + s * 0.22), px(y - s * 0.2));
  ctx.stroke();
  if (text) label(ctx, x + side * (s / 2 + 4), y + 3, text, side > 0 ? 'left' : 'right');
}

/** curva tracejada (Bézier quadrática) com setas em ">" ao longo do caminho */
export function arrowCurve(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  bend: number,
  opts: { arrows?: number; dash?: [number, number]; phase?: number; dim?: boolean } = {},
) {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const dx = bx - ax;
  const dy = by - ay;
  // controle no perpendicular, deslocado em fração do comprimento
  const cx = mx - dy * bend;
  const cy = my + dx * bend;
  ctx.strokeStyle = opts.dim ? INK_DIM : INK;
  ctx.setLineDash(opts.dash ?? [4, 4]);
  ctx.lineDashOffset = -(opts.phase ?? 0);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(cx, cy, bx, by);
  ctx.stroke();
  ctx.setLineDash([]);
  const n = opts.arrows ?? 2;
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const u = 1 - t;
    const x = u * u * ax + 2 * u * t * cx + t * t * bx;
    const y = u * u * ay + 2 * u * t * cy + t * t * by;
    const tx = 2 * u * (cx - ax) + 2 * t * (bx - cx);
    const ty = 2 * u * (cy - ay) + 2 * t * (by - cy);
    const a = Math.atan2(ty, tx);
    const s = 4.5;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(a - 0.65) * s, y - Math.sin(a - 0.65) * s);
    ctx.lineTo(x, y);
    ctx.lineTo(x - Math.cos(a + 0.65) * s, y - Math.sin(a + 0.65) * s);
    ctx.stroke();
  }
  ctx.strokeStyle = INK;
}

/** linha reta fina entre dois pontos (ligações entre caixas) */
export function link(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, dim = true) {
  ctx.strokeStyle = dim ? INK_DIM : INK;
  ctx.beginPath();
  ctx.moveTo(px(ax), px(ay));
  ctx.lineTo(px(bx), px(by));
  ctx.stroke();
  ctx.strokeStyle = INK;
}

/** gerador pseudoaleatório com semente (o mesmo desenho a cada quadro, sem tremer à toa) */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}
