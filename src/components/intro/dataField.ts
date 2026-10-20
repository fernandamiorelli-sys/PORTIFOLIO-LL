// Camada de LCD atrás do vidro da title screen (referência: a title screen de Cyberpunk 2077).
// Desenhada no espaço do painel (textura em potência de 2). Nada aqui é dado de enfeite:
// são os arquivos, as coordenadas, a taxonomia e as medidas do próprio projeto.
import { CALANGO_SILHOUETTE, CALANGO_SPINE, CALANGO_VIEWBOX } from '../../assets/calango';

const MONO = '"Courier Prime", "Courier New", monospace';
const LED = '"Doto Variable", "Courier Prime", monospace';
const OSSO = '232,227,215';
const VERDE = '124,217,59';

const TAXONOMY = [
  'TROPIDURUS HISPIDUS // CALANGO // SANGUE FRIO',
  'ZIZIPHUS JOAZEIRO // JUAZEIRO // VERDE NA SECA',
  'CEREUS JAMACARU // MANDACARU',
  'EQUUS CABALLUS // PÉ-DURO // SERTÃO',
  'CAATINGA // 41°C // UMIDADE 12%',
  "PORTO ALEGRE // 30°01'59\"S 51°13'48\"W",
  "MANAUS // 03°07'08\"S 60°01'34\"W",
  'FUNDADO EM 2026 // FUTEBOL SOCIETY',
  'AMIGOS DESDE A 7ª SÉRIE',
  "EVERYTHING I'M NOT MADE ME EVERYTHING I AM",
  'LENTE 18MM // FLASH EDITORIAL // f/8 1/250',
  'MACRO // EPIDERME // GRÃO DE TERRA',
  'FOTOPINTURA // JUAZEIRO // CREPÚSCULO',
  'HIGGSFIELD // GERAÇÃO // DIREÇÃO',
  'CAMISA II // VISITANTE // ALVI-VERDE',
  'CAMISA I // CASA // PRETO + CALANGO',
  'PRÓXIMA ESTAÇÃO // PUCRS // 12/10 16H',
  'BEM-VINDO // LEO GLUHER // 21',
];

const FILES = [
  'sangue-frio/01_alvi-verde.mp4',
  'sangue-frio/02_cordel.jpg',
  'sangue-frio/03_tracao-nas-quatro-patas.jpg',
  'sangue-frio/04_pe-duro.jpg',
  'sangue-frio/05_juazeiro.jpg',
  'sangue-frio/06_insonia.jpg',
  'sangue-frio/07_epiderme.jpg',
  'sangue-frio/08_rural.jpg',
  'sangue-frio/09_bioma.jpg',
  'sangue-frio/10_trademark.jpg',
  'sangue-frio/11_gume.jpg',
  'reforcos/12_telemetria.png',
  'reforcos/13_bagagem.jpg',
  'confrontos/14_reticula.jpg',
  'confrontos/15_preparamento.jpg',
  'confrontos/16_proxima-estacao.png',
  'identidade/17_essencial.jpg',
  'identidade/18_acervo.jpg',
];

const STATUS = ['OK', 'SYNC', 'LOCK', 'DECRYPT', 'HASH', 'OK', 'OK', 'OK'];

type Rand = () => number;

function hex(r: Rand, n: number) {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(r() * 256).toString(16).padStart(2, '0').toUpperCase() + (i % 2 ? ' ' : '');
  return s.trim();
}

interface Column {
  x: number;
  y: number;
  w: number;
  h: number;
  speed: number;
  offset: number;
  kind: 'log' | 'hex' | 'taxonomy';
  lines: { text: string; hot: boolean }[];
  alpha: number;
}

export interface DataState {
  /** 0..1 enquanto o acervo carrega */
  loaded: number;
  /** retângulo (0..1 do painel) atrás do título: ali os dados ficam mais baixos */
  quiet: [number, number, number, number];
  portrait: boolean;
}

export class DataField {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private columns: Column[] = [];
  private r: Rand;
  private last = 0;
  private time = 0;
  private lh = 18;
  private specimen = new Path2D(CALANGO_SILHOUETTE);
  private wave: number[] = [];

  constructor(seed = 7) {
    let s = seed;
    this.r = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
  }

  /** Tamanho da textura (potências de 2). */
  resize(width: number, height: number, portrait: boolean) {
    this.canvas.width = width;
    this.canvas.height = height;
    const s = width / (portrait ? 1024 : 2048);
    this.lh = Math.round(17 * s);
    this.columns = [];
    const add = (x: number, y: number, w: number, h: number, kind: Column['kind'], alpha: number) => {
      const col: Column = { x, y, w, h, kind, alpha, speed: (12 + this.r() * 28) * s, offset: this.r() * 400, lines: [] };
      const rows = Math.ceil(h / this.lh) + 3;
      for (let k = 0; k < rows; k++) col.lines.push(this.makeLine(kind));
      this.columns.push(col);
    };
    const W = width;
    const H = height;
    if (!portrait) {
      // atrás do título: colunas baixas e esparsas
      add(W * 0.05, H * 0.12, W * 0.2, H * 0.78, 'log', 0.16);
      add(W * 0.27, H * 0.12, W * 0.16, H * 0.78, 'hex', 0.12);
      // meio e fundo: denso
      add(W * 0.71, H * 0.1, W * 0.13, H * 0.52, 'hex', 0.5);
      add(W * 0.85, H * 0.1, W * 0.12, H * 0.84, 'log', 0.62);
      add(W * 0.47, H * 0.6, W * 0.22, H * 0.34, 'taxonomy', 0.58);
      add(W * 0.71, H * 0.65, W * 0.13, H * 0.29, 'taxonomy', 0.5);
    } else {
      add(W * 0.06, H * 0.1, W * 0.42, H * 0.36, 'log', 0.14);
      add(W * 0.52, H * 0.1, W * 0.42, H * 0.36, 'hex', 0.12);
      add(W * 0.06, H * 0.72, W * 0.42, H * 0.22, 'taxonomy', 0.55);
      add(W * 0.52, H * 0.72, W * 0.42, H * 0.22, 'log', 0.6);
    }
    this.wave = new Array(160).fill(0);
  }

  private makeLine(kind: Column['kind']) {
    const r = this.r;
    const hot = r() < 0.05;
    switch (kind) {
      case 'log': {
        const f = FILES[Math.floor(r() * FILES.length)];
        return { text: `${hex(r, 2)} ${f.slice(0, 28).padEnd(28, '.')} ${STATUS[Math.floor(r() * STATUS.length)]}`, hot };
      }
      case 'hex':
        return { text: hex(r, 8), hot };
      case 'taxonomy':
        return { text: r() < 0.6 ? TAXONOMY[Math.floor(r() * TAXONOMY.length)] : `${(r() * 999).toFixed(3).padStart(7, '0')} ${hex(r, 4)}`, hot };
    }
  }

  private text(t: string, x: number, y: number, size: number, alpha: number, color = OSSO, font = MONO, weight = 400) {
    const { ctx } = this;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillStyle = `rgba(${color},${alpha})`;
    ctx.fillText(t, x, y);
  }

  /** Avança e desenha. `dt` em segundos. */
  draw(dt: number, state: DataState) {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const s = W / (state.portrait ? 1024 : 2048);
    this.time += dt;
    const t = this.time;

    ctx.fillStyle = '#040605';
    ctx.fillRect(0, 0, W, H);

    // grade fina do terminal
    ctx.strokeStyle = 'rgba(232,227,215,0.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = Math.round(32 * s);
    for (let x = 0; x < W; x += step) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, H);
    }
    for (let y = 0; y < H; y += step) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
    }
    ctx.stroke();

    ctx.textBaseline = 'top';
    const lh = this.lh;

    // colunas rolando
    for (const col of this.columns) {
      col.offset += col.speed * dt;
      while (col.offset >= lh) {
        col.offset -= lh;
        col.lines.shift();
        col.lines.push(this.makeLine(col.kind));
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(col.x - 6 * s, col.y, col.w + 12 * s, col.h);
      ctx.clip();
      ctx.font = `400 ${Math.round(lh * 0.8)}px ${MONO}`;
      for (let i = 0; i < col.lines.length; i++) {
        const line = col.lines[i];
        const y = col.y + i * lh - col.offset;
        if (y < col.y - lh || y > col.y + col.h) continue;
        if (line.hot) {
          ctx.fillStyle = `rgba(${VERDE},${0.16 * col.alpha + 0.04})`;
          ctx.fillRect(col.x - 4 * s, y - 2 * s, col.w, lh);
          ctx.fillStyle = `rgba(${VERDE},${Math.min(1, col.alpha * 1.6)})`;
        } else ctx.fillStyle = `rgba(${OSSO},${col.alpha})`;
        ctx.fillText(line.text, col.x, y, col.w);
      }
      ctx.restore();
    }

    if (!state.portrait) this.drawWide(W, H, s, t, state);
    else this.drawTall(W, H, s, t, state);

    // o que fica atrás do título é rebaixado, para o vidro impresso respirar
    const [qx, qy, qw, qh] = state.quiet;
    const grd = ctx.createRadialGradient((qx + qw * 0.45) * W, (qy + qh * 0.5) * H, 0, (qx + qw * 0.45) * W, (qy + qh * 0.5) * H, Math.max(qw * W, qh * H) * 0.62);
    grd.addColorStop(0, 'rgba(4,6,5,0.78)');
    grd.addColorStop(0.7, 'rgba(4,6,5,0.5)');
    grd.addColorStop(1, 'rgba(4,6,5,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // varredura que atravessa o painel devagar
    const sweep = ((t * 0.09) % 1.25) * H;
    const g = ctx.createLinearGradient(0, sweep - 120 * s, 0, sweep);
    g.addColorStop(0, `rgba(${VERDE},0)`);
    g.addColorStop(1, `rgba(${VERDE},0.07)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, sweep - 120 * s, W, 120 * s);
  }

  private header(W: number, H: number, s: number, t: number) {
    const { ctx } = this;
    const y = H * 0.035;
    ctx.fillStyle = `rgba(${OSSO},0.06)`;
    ctx.fillRect(W * 0.46, y - 6 * s, W * 0.5, 30 * s);
    const clock = new Date();
    const hh = String(clock.getHours()).padStart(2, '0');
    const mm = String(clock.getMinutes()).padStart(2, '0');
    const ss = String(clock.getSeconds()).padStart(2, '0');
    this.text('TERMINAL DO ACERVO // SESSÃO 2026.07', W * 0.47, y, 16 * s, 0.75, OSSO, MONO, 700);
    ctx.textAlign = 'right';
    this.text(`POA ${hh}:${mm}:${ss} // ${(t % 100).toFixed(2).padStart(5, '0')}`, W * 0.95, y, 16 * s, 0.6);
    ctx.textAlign = 'left';
  }

  private status(s: number, t: number, state: DataState, x: number, y: number, w: number) {
    const { ctx } = this;
    const k = Math.min(1, state.loaded);
    this.text(k >= 1 ? 'ACERVO PRONTO · 18/18 PEÇAS · AGUARDANDO OPERADOR' : `CARREGANDO ACERVO · ${String(Math.round(k * 100)).padStart(3, '0')}%`, x, y, 15 * s, 0.7, k >= 1 ? VERDE : OSSO, MONO, 700);
    const by = y + 26 * s;
    ctx.strokeStyle = `rgba(${OSSO},0.3)`;
    ctx.strokeRect(x + 0.5, by + 0.5, w, 12 * s);
    const cells = 48;
    const on = Math.round(cells * k);
    for (let i = 0; i < cells; i++) {
      ctx.fillStyle = i < on ? `rgba(${VERDE},${0.55 + 0.35 * Math.sin(t * 6 + i * 0.4) ** 2})` : `rgba(${OSSO},0.05)`;
      ctx.fillRect(x + 3 * s + (i * (w - 6 * s)) / cells, by + 3 * s, (w - 6 * s) / cells - 2 * s, 6 * s);
    }
  }

  private specimenPanel(x: number, y: number, w: number, h: number, s: number, t: number) {
    const { ctx } = this;
    ctx.strokeStyle = `rgba(${OSSO},0.22)`;
    ctx.lineWidth = Math.max(1, s);
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    this.text('ESPÉCIME 001 — TROPIDURUS HISPIDUS', x + 12 * s, y + 10 * s, 14 * s, 0.75, OSSO, MONO, 700);
    this.text('VARREDURA DORSAL · CRC 112 MM · CAUDA 168 MM', x + 12 * s, y + 30 * s, 12 * s, 0.45);

    const pad = 54 * s;
    const scale = Math.min((w - pad * 2) / CALANGO_VIEWBOX.width, (h - pad * 1.6) / CALANGO_VIEWBOX.height);
    const ox = x + (w - CALANGO_VIEWBOX.width * scale) / 2;
    const oy = y + pad;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.setLineDash([3 / scale, 5 / scale]);
    ctx.lineWidth = 1.4 / scale;
    ctx.strokeStyle = `rgba(${VERDE},0.75)`;
    ctx.stroke(this.specimen);
    ctx.setLineDash([]);
    // espinha medida, vértebra por vértebra
    ctx.strokeStyle = `rgba(${OSSO},0.35)`;
    ctx.beginPath();
    CALANGO_SPINE.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
    ctx.fillStyle = `rgba(${OSSO},0.8)`;
    for (const [px, py] of CALANGO_SPINE) ctx.fillRect(px - 2.5 / scale, py - 2.5 / scale, 5 / scale, 5 / scale);
    ctx.restore();

    // linha de varredura do scanner
    const sy = oy + ((t * 0.35) % 1) * CALANGO_VIEWBOX.height * scale;
    ctx.fillStyle = `rgba(${VERDE},0.5)`;
    ctx.fillRect(x + 6 * s, sy, w - 12 * s, 2 * s);
    ctx.fillStyle = `rgba(${VERDE},0.08)`;
    ctx.fillRect(x + 6 * s, sy - 26 * s, w - 12 * s, 26 * s);
  }

  private wavePanel(x: number, y: number, w: number, h: number, s: number, t: number) {
    const { ctx } = this;
    ctx.strokeStyle = `rgba(${OSSO},0.18)`;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    this.text('SINAL // 0:09 → 0:14', x + 12 * s, y + 10 * s, 13 * s, 0.6, OSSO, MONO, 700);
    this.wave.shift();
    this.wave.push(Math.sin(t * 7.1) * 0.35 + Math.sin(t * 2.3 + 1) * 0.3 + (this.r() - 0.5) * 0.5);
    ctx.strokeStyle = `rgba(${VERDE},0.8)`;
    ctx.lineWidth = 1.6 * s;
    ctx.beginPath();
    const mid = y + h * 0.58;
    this.wave.forEach((v, i) => {
      const px = x + 12 * s + (i / (this.wave.length - 1)) * (w - 24 * s);
      const py = mid + v * h * 0.28;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    ctx.stroke();
  }

  private radar(cx: number, cy: number, rad: number, s: number, t: number) {
    const { ctx } = this;
    ctx.strokeStyle = `rgba(${OSSO},0.2)`;
    ctx.lineWidth = Math.max(1, s);
    for (let k = 1; k <= 3; k++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (rad * k) / 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - rad, cy);
    ctx.lineTo(cx + rad, cy);
    ctx.moveTo(cx, cy - rad);
    ctx.lineTo(cx, cy + rad);
    ctx.stroke();
    const a = t * 1.3;
    const g = ctx.createConicGradient ? ctx.createConicGradient(a - 0.9, cx, cy) : null;
    if (g) {
      g.addColorStop(0, `rgba(${VERDE},0)`);
      g.addColorStop(0.14, `rgba(${VERDE},0.28)`);
      g.addColorStop(0.15, `rgba(${VERDE},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    // POA e Manaus como alvos
    const blips: [number, number, string][] = [
      [0.32, -0.4, 'POA'],
      [-0.5, 0.36, 'MAO'],
    ];
    for (const [bx, by, label] of blips) {
      const px = cx + bx * rad;
      const py = cy + by * rad;
      ctx.fillStyle = `rgba(${VERDE},${0.5 + 0.5 * Math.sin(t * 4 + bx * 9) ** 2})`;
      ctx.fillRect(px - 4 * s, py - 4 * s, 8 * s, 8 * s);
      this.text(label, px + 9 * s, py - 6 * s, 12 * s, 0.7);
    }
    this.text("30°01'59\"S 51°13'48\"W", cx - rad, cy + rad + 10 * s, 12 * s, 0.5);
  }

  private bigNumbers(x: number, y: number, s: number, t: number) {
    const k = Math.floor(t * 0.5) % 3;
    const words = ['2026', '18', 'FR'];
    this.text(words[k], x, y, 150 * s, 0.13, VERDE, LED, 900);
  }

  private drawWide(W: number, H: number, s: number, t: number, state: DataState) {
    this.header(W, H, s, t);
    this.specimenPanel(W * 0.47, H * 0.1, W * 0.22, H * 0.46, s, t);
    this.wavePanel(W * 0.71, H * 0.65 - H * 0.0, W * 0.13, H * 0.12, s, t);
    this.radar(W * 0.775, H * 0.84 + 4 * s, H * 0.06, s, t);
    this.bigNumbers(W * 0.5, H * 0.66, s, t);
    this.status(s, t, state, W * 0.47, H * 0.92, W * 0.48);
  }

  private drawTall(W: number, H: number, s: number, t: number, state: DataState) {
    this.header(W, H, s, t);
    this.specimenPanel(W * 0.52, H * 0.48, W * 0.42, H * 0.22, s, t);
    this.wavePanel(W * 0.06, H * 0.48, W * 0.42, H * 0.1, s, t);
    this.radar(W * 0.27, H * 0.64, W * 0.07, s, t);
    this.status(s, t, state, W * 0.06, H * 0.955, W * 0.88);
  }

  /** 30 fps basta atrás do vidro. */
  shouldDraw(now: number, fps = 30) {
    if (now - this.last < 1000 / fps) return false;
    this.last = now;
    return true;
  }
}
