// Campo de dados atrás do vidro da title screen (referência: title screen de Cyberpunk 2077).
// Nada aqui é aleatório no sentido do conteúdo: são os dados do próprio projeto.

const TAXONOMY = [
  'TROPIDURUS HISPIDUS // CALANGO // SANGUE FRIO',
  'ZIZIPHUS JOAZEIRO // JUAZEIRO // VERDE NA SECA',
  'CEREUS JAMACARU // MANDACARU',
  'EQUUS CABALLUS // PÉ-DURO // SERTÃO',
  'CAATINGA // 41°C // UMIDADE 12%',
  'PORTO ALEGRE // 30°01\'59"S 51°13\'48"W',
  'MANAUS // 03°07\'08"S 60°01\'34"W',
  'FUNDADO EM 2026 // FUTEBOL SOCIETY',
  'AMIGOS DESDE A 7ª SÉRIE',
  'EVERYTHING I\'M NOT MADE ME EVERYTHING I AM',
  'LENTE 18MM // FLASH EDITORIAL // f/8 1/250',
  'MACRO // EPIDERME // GRÃO DE TERRA',
  'FOTOPINTURA // JUAZEIRO // CREPÚSCULO',
  'HIGGSFIELD // GERAÇÃO // DIREÇÃO',
  'CAMISA II // VISITANTE // ALVI-VERDE',
  'CAMISA I // CASA // PRETO + CALANGO',
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
  'sangue-frio/11_gume.svg',
  'reforcos/12_telemetria.png',
  'reforcos/13_bagagem.jpg',
  'confrontos/14_reticula.jpg',
  'confrontos/15_preparamento.jpg',
  'confrontos/16_miragem.png',
  'identidade/17_essencial.jpg',
  'identidade/18_acervo.jpg',
];

const PALETTE = ['070807', 'E8E3D7', '1F8645', '026A36', '7CD93B', '6A7C96', 'A8C4B0', '8C6A43'];
const STATUS = ['OK', 'SYNC', 'LOCK', 'DECRYPT', 'HASH', 'OK', 'OK'];
const BARS = '▁▂▃▄▅▆▇█';

type Rand = () => number;

function hex(r: Rand, n: number) {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(r() * 256).toString(16).padStart(2, '0').toUpperCase() + (i % 2 ? ' ' : '');
  return s.trim();
}

interface Line {
  text: string;
  hot: boolean;
}

interface Column {
  x: number;
  width: number;
  speed: number;
  offset: number;
  kind: 'log' | 'hex' | 'taxonomy' | 'meter' | 'big';
  lines: Line[];
  alpha: number;
}

export class DataField {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private columns: Column[] = [];
  private r: Rand;
  private lineH = 14;
  private last = 0;
  private time = 0;

  constructor(seed = 7) {
    let s = seed;
    this.r = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
  }

  resize(width: number, height: number) {
    this.canvas.width = Math.round(width);
    this.canvas.height = Math.round(height);
    const mobile = width < 700;
    this.lineH = mobile ? 12 : 14;
    const colW = mobile ? 168 : 236;
    const count = Math.ceil(width / colW) + 1;
    const kinds: Column['kind'][] = ['log', 'taxonomy', 'hex', 'meter', 'log', 'big', 'hex', 'taxonomy'];
    this.columns = [];
    for (let i = 0; i < count; i++) {
      const kind = kinds[i % kinds.length];
      const col: Column = {
        x: i * colW + 10 + this.r() * 18,
        width: colW - 20,
        speed: (kind === 'big' ? 6 : 10) + this.r() * 26,
        offset: this.r() * 400,
        kind,
        lines: [],
        alpha: (kind === 'meter' ? 0.16 : 0.26) + this.r() * 0.3,
      };
      const rows = Math.ceil(height / this.lineH) + 4;
      for (let k = 0; k < rows; k++) col.lines.push(this.makeLine(kind));
      this.columns.push(col);
    }
  }

  private makeLine(kind: Column['kind']): Line {
    const r = this.r;
    const hot = r() < 0.045;
    switch (kind) {
      case 'log': {
        const f = FILES[Math.floor(r() * FILES.length)];
        const st = STATUS[Math.floor(r() * STATUS.length)];
        return { text: `${hex(r, 2)} ${f.slice(0, 26).padEnd(26, '.')} ${st}`, hot };
      }
      case 'hex':
        return { text: r() < 0.18 ? `#${PALETTE[Math.floor(r() * PALETTE.length)]} ${hex(r, 6)}` : hex(r, 9), hot };
      case 'taxonomy':
        return { text: r() < 0.55 ? TAXONOMY[Math.floor(r() * TAXONOMY.length)] : `${(r() * 999).toFixed(3).padStart(7, '0')} ${hex(r, 4)}`, hot };
      case 'meter': {
        let bar = '';
        const n = 6 + Math.floor(r() * 14);
        for (let i = 0; i < n; i++) bar += BARS[Math.floor(r() * BARS.length)];
        return { text: `${String(Math.floor(r() * 100)).padStart(2, '0')}% ${bar}`, hot };
      }
      case 'big':
        return { text: r() < 0.3 ? ['2026', '07', '09:14', 'FR', '11', '18'][Math.floor(r() * 6)] : '', hot: false };
    }
  }

  /** Avança e desenha. `dt` em segundos. */
  draw(dt: number) {
    const { ctx, canvas } = this;
    this.time += dt;
    ctx.fillStyle = '#060706';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textBaseline = 'top';
    const lh = this.lineH;

    for (const col of this.columns) {
      col.offset += col.speed * dt;
      while (col.offset >= lh) {
        col.offset -= lh;
        col.lines.shift();
        col.lines.push(this.makeLine(col.kind));
      }
      const big = col.kind === 'big';
      ctx.font = big ? `300 ${lh * 3.2}px "Martian Mono Variable", monospace` : `400 ${lh * 0.7}px "Martian Mono Variable", monospace`;
      const step = big ? lh * 3.4 : lh;
      for (let i = 0; i < col.lines.length; i++) {
        const line = col.lines[i];
        if (!line.text) continue;
        const y = (big ? i * step : i * lh) - col.offset * (big ? 3.4 : 1);
        if (y < -step || y > canvas.height) continue;
        if (line.hot) {
          ctx.fillStyle = 'rgba(124,217,59,0.16)';
          ctx.fillRect(col.x - 4, y - 2, col.width, lh);
          ctx.fillStyle = 'rgba(124,217,59,0.95)';
        } else {
          ctx.fillStyle = big ? `rgba(232,227,215,${col.alpha * 0.18})` : `rgba(232,227,215,${col.alpha})`;
        }
        ctx.fillText(line.text, col.x, y, col.width);
      }
    }

    // barra de varredura que atravessa a tela devagar
    const sweep = ((this.time * 0.07) % 1.3) * canvas.height;
    const g = ctx.createLinearGradient(0, sweep - 80, 0, sweep);
    g.addColorStop(0, 'rgba(124,217,59,0)');
    g.addColorStop(1, 'rgba(124,217,59,0.06)');
    ctx.fillStyle = g;
    ctx.fillRect(0, sweep - 80, canvas.width, 80);
  }

  /** Para controlar a taxa de atualização do lado de fora (30 fps é suficiente atrás do vidro). */
  shouldDraw(now: number) {
    if (now - this.last < 1000 / 30) return false;
    this.last = now;
    return true;
  }
}
