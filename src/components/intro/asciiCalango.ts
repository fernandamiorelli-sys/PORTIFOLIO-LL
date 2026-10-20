import { CALANGO_FILL, CALANGO_SILHOUETTE, CALANGO_SPINE, CALANGO_VIEWBOX } from '../../assets/calango';

// O calango minimalista desenhado em caracteres. Ele se forma da cabeça à cauda
// (a ordem segue a espinha dorsal do desenho) e depois se dissolve quando vira 3D.

const RAMP = ' .:-=+*#%@';
const NOISE = '01<>/\\|{}[]#$%&*+=-_:;~^ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CALANGO = '124,217,59';
const OSSO = '232,227,215';

interface Cell {
  x: number;
  y: number;
  /** cobertura 0..1 dentro da silhueta */
  cover: number;
  /** dentro da listra/olho (vazado no patch) */
  gap: boolean;
  /** instante (0..1 do progresso) em que a célula trava */
  lock: number;
  /** ordem de dissolução (0..1, de cima para baixo com ruído) */
  melt: number;
  final: string;
  glyph: string;
  flash: number;
  /** posição ao longo da espinha (0 focinho → 1 ponta da cauda) */
  spine: number;
}

export interface Glyph {
  /** centro da célula em px da tela */
  x: number;
  y: number;
  ch: string;
  spine: number;
  gap: boolean;
}

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function spineParam(px: number, py: number) {
  let best = Infinity;
  let bestT = 0;
  const n = CALANGO_SPINE.length;
  for (let i = 0; i < n - 1; i++) {
    const [ax, ay] = CALANGO_SPINE[i];
    const [bx, by] = CALANGO_SPINE[i + 1];
    const vx = bx - ax;
    const vy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
    const dx = ax + vx * t - px;
    const dy = ay + vy * t - py;
    const d = dx * dx + dy * dy;
    if (d < best) {
      best = d;
      bestT = (i + t) / (n - 1);
    }
  }
  return bestT;
}

export class AsciiCalango {
  readonly cols: number;
  readonly rows: number;
  private cells: Cell[] = [];
  private noise: { x: number; y: number; life: number; glyph: string }[] = [];
  private ctx: CanvasRenderingContext2D;
  private cw = 0;
  private ch = 0;
  private rand = seeded(1307);
  progress = 0;
  dissolve = 0;
  private lastShimmer = 0;

  constructor(private canvas: HTMLCanvasElement, rows = 62) {
    this.ctx = canvas.getContext('2d')!;
    this.rows = rows;
    // célula de fonte mono ~0.6 de proporção
    this.cols = Math.round(rows * (CALANGO_VIEWBOX.width / CALANGO_VIEWBOX.height) / 0.6);
    this.buildGrid();
  }

  private buildGrid() {
    const S = 4; // supersampling para medir cobertura
    const W = this.cols * S;
    const H = this.rows * S;
    const sample = (d: string) => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const x = c.getContext('2d', { willReadFrequently: true })!;
      x.scale(W / CALANGO_VIEWBOX.width, H / CALANGO_VIEWBOX.height);
      x.fillStyle = '#fff';
      x.fill(new Path2D(d), 'evenodd');
      return x.getImageData(0, 0, W, H).data;
    };
    const sil = sample(CALANGO_SILHOUETTE);
    const fill = sample(CALANGO_FILL);
    const r = this.rand;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        let cs = 0;
        let cf = 0;
        for (let sy = 0; sy < S; sy++)
          for (let sx = 0; sx < S; sx++) {
            const i = ((y * S + sy) * W + x * S + sx) * 4;
            cs += sil[i] > 127 ? 1 : 0;
            cf += fill[i] > 127 ? 1 : 0;
          }
        const cover = cs / (S * S);
        if (cover < 0.12) continue;
        const coverFill = cf / (S * S);
        const gap = coverFill < 0.35;
        const px = ((x + 0.5) / this.cols) * CALANGO_VIEWBOX.width;
        const py = ((y + 0.5) / this.rows) * CALANGO_VIEWBOX.height;
        const s = spineParam(px, py);
        const ramp = gap ? '.:' : RAMP.slice(3);
        const final = gap ? (r() < 0.5 ? '·' : ' ') : ramp[Math.min(ramp.length - 1, Math.floor(coverFill * coverFill * ramp.length * (0.75 + r() * 0.5)))];
        this.cells.push({
          x,
          y,
          cover,
          gap,
          lock: Math.min(0.96, s * 0.72 + r() * 0.22),
          melt: Math.min(1, (y / this.rows) * 0.8 + r() * 0.2),
          final,
          glyph: NOISE[Math.floor(r() * NOISE.length)],
          flash: 0,
          spine: s,
        });
      }
    }
    for (let i = 0; i < 260; i++) {
      this.noise.push({ x: Math.floor(r() * this.cols), y: Math.floor(r() * this.rows), life: r(), glyph: NOISE[Math.floor(r() * NOISE.length)] });
    }
  }

  /** Ajusta a resolução do canvas ao tamanho exibido. */
  resize(cssWidth: number, cssHeight: number, dpr = Math.min(window.devicePixelRatio || 1, 2)) {
    this.canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    this.cw = this.canvas.width / this.cols;
    this.ch = this.canvas.height / this.rows;
  }

  /** Células do desenho com o centro em px da tela: a passagem de bastão para o calango 3D. */
  glyphs(rect: DOMRect): Glyph[] {
    return this.cells.map((c) => ({
      x: rect.left + ((c.x + 0.5) / this.cols) * rect.width,
      y: rect.top + ((c.y + 0.5) / this.rows) * rect.height,
      ch: c.final === ' ' ? '·' : c.final,
      spine: c.spine,
      gap: c.gap,
    }));
  }

  /** Altura de uma célula em px CSS, para as partículas nascerem do mesmo tamanho. */
  cellHeight(rect: DOMRect) {
    return rect.height / this.rows;
  }

  /** Proporção largura/altura do desenho. */
  static get aspect() {
    return CALANGO_VIEWBOX.width / CALANGO_VIEWBOX.height;
  }

  draw(now: number) {
    const { ctx, cw, ch } = this;
    if (!cw) return;
    const r = this.rand;
    const p = this.progress;
    const melt = this.dissolve;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.max(4, ch * 0.98)}px "Courier Prime", "Courier New", monospace`;

    // ruído fora da silhueta: o "código" convergindo, some conforme o desenho fecha
    if (p < 1 && melt === 0) {
      const alpha = Math.max(0, 0.55 - p * 0.62);
      if (alpha > 0) {
        ctx.fillStyle = `rgba(${OSSO},${alpha})`;
        for (const n of this.noise) {
          n.life -= 0.02;
          if (n.life <= 0) {
            n.life = 0.5 + r() * 0.5;
            n.x = Math.floor(r() * this.cols);
            n.y = Math.floor(r() * this.rows);
            n.glyph = NOISE[Math.floor(r() * NOISE.length)];
          }
          ctx.fillText(n.glyph, (n.x + 0.5) * cw, (n.y + 0.5) * ch);
        }
      }
    }

    const shimmer = now - this.lastShimmer > 70;
    if (shimmer) this.lastShimmer = now;

    for (const c of this.cells) {
      const cx = (c.x + 0.5) * cw;
      const cy = (c.y + 0.5) * ch;
      if (melt > 0) {
        const m = melt * 1.25 - c.melt;
        if (m > 0.25) continue;
        if (m > 0) {
          ctx.fillStyle = `rgba(${OSSO},${1 - m * 4})`;
          ctx.fillText(NOISE[Math.floor(r() * NOISE.length)], cx, cy);
          continue;
        }
      }
      if (p < c.lock) {
        // ainda criptografado: cintila mais forte quando está perto de travar
        const near = 1 - Math.min(1, (c.lock - p) / 0.25);
        if (near <= 0 && r() > 0.12) continue;
        if (r() < 0.35) c.glyph = NOISE[Math.floor(r() * NOISE.length)];
        ctx.fillStyle = `rgba(${OSSO},${0.08 + near * 0.45})`;
        ctx.fillText(c.glyph, cx, cy);
        continue;
      }
      if (c.flash === 0) c.flash = now;
      const since = now - c.flash;
      if (c.gap) {
        ctx.fillStyle = `rgba(${CALANGO},0.22)`;
        ctx.fillText(c.final, cx, cy);
        continue;
      }
      if (since < 140) {
        ctx.fillStyle = `rgba(255,255,255,${1 - since / 200})`;
        ctx.fillText(NOISE[Math.floor(r() * NOISE.length)], cx, cy);
        continue;
      }
      // brilho residual: algumas células re-embaralham de vez em quando
      let glyph = c.final;
      if (shimmer && r() < 0.006) c.flash = now - 60;
      if (since < 220) glyph = c.glyph;
      ctx.fillStyle = `rgba(${CALANGO},${0.55 + c.cover * 0.45})`;
      ctx.fillText(glyph, cx, cy);
    }
  }
}
