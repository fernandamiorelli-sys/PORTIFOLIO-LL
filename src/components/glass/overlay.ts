import { CALANGO_SPINE } from '../../assets/calango';
import { arrowCurve, box, label, link, marker, prepare, rng } from '../../lib/dataOverlay';
import type { GlassHeader } from './asset';
import type { GlassRenderer } from './glassRenderer';
import { modelPoint, outlineModel } from './outline';

// O data overlay sobre o calango de vidro: a máquina lendo a forma do logo minimalista.
// Pontos do desenho (focinho, olho, patas, ponta da cauda, espinha) são projetados da peça 3D a cada
// leitura, e a leitura acontece em saltos (12 por segundo), como um rastreador de verdade.

const FEATURES: { name: string; at: [number, number] }[] = [
  { name: 'focinho', at: [323.7, 21.7] },
  { name: 'olho', at: [271.6, 64.4] },
  { name: 'pata 1', at: [150, 140] },
  { name: 'pata 2', at: [345, 210] },
  { name: 'pata 3', at: [300, 350] },
  { name: 'pata 4', at: [75, 415] },
  { name: 'cauda', at: [49, 588] },
];

const pad3 = (n: number) => String(Math.max(0, Math.round(n))).padStart(3, '0');
const deg = (r: number) => {
  const d = ((((r * 180) / Math.PI) % 360) + 360) % 360;
  return String(Math.round(d)).padStart(3, '0');
};

export class GlassOverlay {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private model: Float32Array;
  private scr: Float32Array;
  private nOutline: number;
  private nSpine: number;
  private last = -1e9;
  private seed = 1;
  /** acima disto fica o cabeçalho do documento: a ficha de dados não sobe ali */
  safeTop = 0;

  constructor(header: GlassHeader) {
    this.ctx = this.canvas.getContext('2d')!;
    // contorno amostrado (frente e verso), para a caixa justa em volta da peça
    const N = 72;
    const outline = outlineModel(header, N);
    this.nOutline = N * 2;
    const spine = CALANGO_SPINE.flatMap(([x, y]) => modelPoint(header, x, y));
    this.nSpine = CALANGO_SPINE.length;
    const feats = FEATURES.flatMap((f) => modelPoint(header, ...f.at));
    this.model = new Float32Array([...outline, ...spine, ...feats]);
    this.scr = new Float32Array((this.model.length / 3) * 2);
  }

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.last = -1e9;
  }

  clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Uma leitura nova a cada 1/12 s (1/30 com o cursor em cima); entre elas, o desenho fica parado
   *  (o salto é o efeito). `still` (movimento reduzido): sem tremor e sem tracejado correndo.
   *  `lock`: o cursor sobre a peça (px do palco) e o quanto a trava já entrou (0..1). */
  update(
    now: number,
    glass: GlassRenderer,
    opts: { compact: boolean; alpha: number; force?: boolean; still?: boolean; lock?: { x: number; y: number; amount: number } },
  ) {
    const locked = (opts.lock?.amount ?? 0) > 0.02;
    if (!opts.force && now - this.last < 1000 / (locked ? 30 : 12)) return;
    this.last = now;
    this.seed = (this.seed * 1103515245 + 12345) >>> 0;
    const r = rng(opts.still ? 7 : this.seed);
    const j = () => (opts.still ? 0 : (r() - 0.5) * 1.4);
    glass.project(this.model, this.scr);
    const { ctx, scr } = this;
    this.clear();
    if (opts.alpha <= 0.01) return;
    prepare(ctx, this.dpr);
    ctx.globalAlpha = opts.alpha;

    // caixa da peça inteira
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < this.nOutline; i++) {
      x0 = Math.min(x0, scr[i * 2]);
      x1 = Math.max(x1, scr[i * 2]);
      y0 = Math.min(y0, scr[i * 2 + 1]);
      y1 = Math.max(y1, scr[i * 2 + 1]);
    }
    const bw = x1 - x0;
    const bh = y1 - y0;
    box(ctx, x0 - 10 + j(), y0 - 10 + j(), bw + 20, bh + 20, {
      ticks: locked ? 22 : 14,
      top: locked ? (opts.compact ? 'ALVO TRAVADO' : 'ESPÉCIME 01 · ALVO TRAVADO') : opts.compact ? 'CALANGO_MIN' : 'ESPÉCIME 01 · CALANGO_MIN',
      bottom: `W ${pad3(bw)} · H ${pad3(bh)}`,
    });

    const sp = (k: number) => [scr[(this.nOutline + k) * 2] + j(), scr[(this.nOutline + k) * 2 + 1] + j()] as const;
    const ft = (k: number) => [scr[(this.nOutline + this.nSpine + k) * 2] + j(), scr[(this.nOutline + this.nSpine + k) * 2 + 1] + j()] as const;

    // espinha: pontos pequenos e a curva do corpo, da cabeça à cauda
    const phase = opts.still ? 0 : (now / 40) % 8;
    const chain = [0, 4, 8, 11, this.nSpine - 1];
    for (let k = 0; k < chain.length - 1; k++) {
      const [ax, ay] = sp(chain[k]);
      const [bx, by] = sp(chain[k + 1]);
      arrowCurve(ctx, ax, ay, bx, by, k % 2 ? -0.22 : 0.22, { arrows: 1, phase });
    }
    for (let k = 0; k < this.nSpine; k += 3) {
      const [x, y] = sp(k);
      marker(ctx, x, y, 4);
    }

    // traços do desenho: focinho, olho, patas, cauda
    const sz = Math.max(26, bh * 0.085);
    FEATURES.forEach((f, k) => {
      const [x, y] = ft(k);
      const right = x > (x0 + x1) / 2;
      const coord = `x: ${pad3(x)} y: ${pad3(y)}`;
      // a coordenada vai para fora da peça, mas nunca para fora da tela
      const cw = ctx.measureText(coord).width + 12;
      const side: 1 | -1 = right ? (x + cw < this.w - 6 ? 1 : -1) : x - cw > 6 ? -1 : 1;
      if (f.name.startsWith('pata')) {
        box(ctx, x - sz / 2, y - sz / 2, sz, sz, { dim: true, top: opts.compact ? undefined : `${f.name.toUpperCase()} ${(0.9 + r() * 0.09).toFixed(2)}` });
        marker(ctx, x, y, 6, opts.compact ? undefined : coord, side);
        // cada pata se liga ao ponto mais próximo da espinha
        let best = 0;
        let bd = Infinity;
        for (let s = 0; s < this.nSpine; s++) {
          const [sx, sy] = sp(s);
          const d = (sx - x) ** 2 + (sy - y) ** 2;
          if (d < bd) {
            bd = d;
            best = s;
          }
        }
        const [sx, sy] = sp(best);
        arrowCurve(ctx, x, y, sx, sy, right ? 0.3 : -0.3, { arrows: 1, dim: true, phase });
      } else {
        marker(ctx, x, y, 7, coord, side);
      }
    });

    // cabeça: focinho + olho + nuca
    const hp = [ft(0), ft(1), sp(0), sp(1)];
    const hx0 = Math.min(...hp.map((p) => p[0])) - 16;
    const hy0 = Math.min(...hp.map((p) => p[1])) - 16;
    const hx1 = Math.max(...hp.map((p) => p[0])) + 16;
    const hy1 = Math.max(...hp.map((p) => p[1])) + 16;
    box(ctx, hx0, hy0, hx1 - hx0, hy1 - hy0, { dim: true, top: opts.compact ? undefined : `CABEÇA ${(0.95 + r() * 0.04).toFixed(2)}` });

    // dois arcos largos: a leitura da forma inteira (da cabeça às patas de trás e à cauda)
    if (!opts.compact) {
      const [tx, ty] = ft(6);
      const [px, py] = ft(5);
      arrowCurve(ctx, hx1, hy0, tx, ty, -0.42, { arrows: 3, dim: true, phase, dash: [3, 5] });
      arrowCurve(ctx, hx0, hy1, px, py, 0.38, { arrows: 2, dim: true, phase, dash: [3, 5] });
      const [ex, ey] = ft(1);
      link(ctx, ex, ey, x1 + 10, ey);
    }

    // o cursor em cima: mira no ponteiro e uma seta até a parte do desenho mais perto dele
    if (locked && opts.lock) {
      const { x, y, amount } = opts.lock;
      ctx.globalAlpha = opts.alpha * amount;
      ctx.beginPath();
      ctx.moveTo(x - 16, y + 0.5);
      ctx.lineTo(x - 6, y + 0.5);
      ctx.moveTo(x + 6, y + 0.5);
      ctx.lineTo(x + 16, y + 0.5);
      ctx.moveTo(x + 0.5, y - 16);
      ctx.lineTo(x + 0.5, y - 6);
      ctx.moveTo(x + 0.5, y + 6);
      ctx.lineTo(x + 0.5, y + 16);
      ctx.stroke();
      let best = 0;
      let bd = Infinity;
      FEATURES.forEach((_, k) => {
        const [fx, fy] = ft(k);
        const d = (fx - x) ** 2 + (fy - y) ** 2;
        if (d < bd) {
          bd = d;
          best = k;
        }
      });
      const [fx, fy] = ft(best);
      arrowCurve(ctx, x, y, fx, fy, 0.25, { arrows: 1, phase });
      marker(ctx, fx, fy, 13);
      const right = x + 150 < this.w;
      label(ctx, right ? x + 20 : x - 20, y - 8, `MIRA · ${FEATURES[best].name.toUpperCase()} ${pad3(Math.sqrt(bd))} PX`, right ? 'left' : 'right');
      ctx.globalAlpha = opts.alpha;
    }

    // ficha da leitura, ao lado da caixa
    const lines = opts.compact
      ? ['ANÁLISE DE FORMA', `ROT Y ${deg(glass.rot.y)} X ${deg(glass.rot.x)}`]
      : [
          'ANÁLISE DE FORMA // LOGO',
          'PATAS 04 · DEDOS 12',
          'CAUDA 01 · LISTRAS 02',
          'OLHO 01 · VIDRO 1.52',
          `ROT Y ${deg(glass.rot.y)} X ${deg(glass.rot.x)}`,
          `CONF ${(0.95 + r() * 0.04).toFixed(2)}`,
        ];
    // ao lado da caixa (direita, senão esquerda); sem espaço dos lados (celular), no canto de
    // cima da própria caixa, que fica vazio (a cabeça do calango está do outro lado)
    const lw = Math.max(...lines.map((t) => ctx.measureText(t).width));
    const side = x1 + 26 + lw < this.w - 24 ? 1 : x0 - 26 - lw > 16 ? -1 : 0;
    if (side) {
      const lx = side > 0 ? x1 + 26 : x0 - 26 - lw;
      const ly = Math.min(this.h - lines.length * 13 - 16, Math.max(this.safeTop + 10, y0 + 6));
      lines.forEach((t, i) => label(ctx, lx, ly + i * 13, t));
      link(ctx, side > 0 ? lx - 4 : lx + lw + 4, ly - 3, side > 0 ? x1 + 10 : x0 - 10, ly - 3);
    } else {
      lines.forEach((t, i) => label(ctx, x0 - 2, y0 + 8 + i * 13, t));
    }
    ctx.globalAlpha = 1;
  }
}
