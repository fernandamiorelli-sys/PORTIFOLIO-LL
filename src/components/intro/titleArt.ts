// Camada impressa no vidro da title screen: escudo oficial + título + autor + chamada.
// Desenhada no espaço do painel (a textura cobre o vidro inteiro). O título entra em foco letra a letra
// pela escada da Redaction; o "NÃO" nunca resolve: fica em bitmap, em itálico, em verde.
import { ADV } from '../type/advances';

const OSSO = '#E8E3D7';
const CALANGO = '#7CD93B';
const MONO = '"Courier Prime", "Courier New", monospace';

const FAMILY: Record<number, string> = {
  0: '"Redaction", "Times New Roman", serif',
  20: '"Redaction 20", "Redaction", serif',
  35: '"Redaction 35", "Redaction", serif',
  50: '"Redaction 50", "Redaction", serif',
  70: '"Redaction 70", "Redaction", serif',
  100: '"Redaction 100", "Redaction", serif',
};

export const TITLE_LINES = ['TUDO O QUE', 'NÃO SOMOS'] as const;
/** índices (na sequência de letras das duas linhas, sem espaços) que formam o "NÃO" */
export const NAO = new Set([8, 9, 10]);
/** quantidade de letras (sem espaços) do título */
export const TITLE_CHARS = TITLE_LINES.join('').replace(/\s/g, '').length;

export interface PrintLayout {
  /** retângulo do "aperte qualquer botão" em uv do vidro (origem embaixo à esquerda) */
  prompt: [number, number, number, number];
  /** retângulo (0..1, origem em cima) atrás do título, para os dados abaixarem */
  quiet: [number, number, number, number];
  /** onde a lente foca (uv do vidro) */
  focus: [number, number];
}

export interface PrintOptions {
  crest: HTMLImageElement | null;
  width: number;
  height: number;
  portrait: boolean;
  /** degrau de cada letra do título (sem espaços) */
  levels: number[];
  /** texto da chamada (muda enquanto carrega) */
  prompt: string;
}

function setSpacing(ctx: CanvasRenderingContext2D, px: number) {
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

export function drawGlassPrint(canvas: HTMLCanvasElement, o: PrintOptions): PrintLayout {
  canvas.width = o.width;
  canvas.height = o.height;
  const ctx = canvas.getContext('2d')!;
  const W = o.width;
  const H = o.height;
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';

  // tudo em "unidades de painel": a altura do vidro vale 1 (no retrato, a largura vale 1)
  const unit = o.portrait ? W : H;
  const L = o.portrait
    ? { x: 0.1, crestY: 0.16, crestH: 0.36, title: 0.128, gap: 0.05 }
    : { x: 0.1, crestY: 0.15, crestH: 0.24, title: 0.128, gap: 0.035 };
  const x0 = L.x * unit;
  let y = L.crestY * unit;

  // cabeçalho técnico
  ctx.font = `700 ${0.018 * unit}px ${MONO}`;
  setSpacing(ctx, 0.004 * unit);
  ctx.fillStyle = 'rgba(232,227,215,0.72)';
  ctx.fillText('EXPOSIÇÃO PERMANENTE  ·  4 SALAS  ·  18 PEÇAS', x0, y - 0.035 * unit);
  setSpacing(ctx, 0);

  // escudo oficial (recortado do círculo verde)
  if (o.crest) {
    const ch = L.crestH * unit;
    const cw = ch * (o.crest.naturalWidth / o.crest.naturalHeight);
    ctx.save();
    ctx.globalAlpha = 0.97;
    ctx.shadowColor = 'rgba(124,217,59,0.35)';
    ctx.shadowBlur = 0.02 * unit;
    ctx.drawImage(o.crest, x0 - cw * 0.04, y, cw, ch);
    ctx.restore();
    // colchetes de mira em volta do escudo
    ctx.strokeStyle = 'rgba(232,227,215,0.5)';
    ctx.lineWidth = Math.max(1.5, 0.0022 * unit);
    const m = 0.012 * unit;
    const bx = x0 - cw * 0.04 - m;
    const by = y - m;
    const bw = cw + m * 2;
    const bh = ch + m * 2;
    const k = 0.03 * unit;
    ctx.beginPath();
    ctx.moveTo(bx, by + k);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + k, by);
    ctx.moveTo(bx + bw - k, by + bh);
    ctx.lineTo(bx + bw, by + bh);
    ctx.lineTo(bx + bw, by + bh - k);
    ctx.stroke();
    ctx.font = `400 ${0.014 * unit}px ${MONO}`;
    ctx.fillStyle = 'rgba(232,227,215,0.6)';
    ctx.fillText('ESCUDO OFICIAL · 2026', bx + bw + 0.012 * unit, by + 0.02 * unit);
    ctx.fillText('FUTEBOL SOCIETY · POA', bx + bw + 0.012 * unit, by + 0.042 * unit);
    y += ch + L.gap * unit;
  }

  // título, letra a letra
  const size = L.title * unit;
  const ls = -0.03 * size;
  let idx = 0;
  const lineH = size * 0.92;
  const titleTop = y;
  const baselines: number[] = [];
  TITLE_LINES.forEach((line, li) => {
    const base = y + size * 0.8 + li * lineH;
    baselines.push(base);
    let x = x0;
    for (const ch of line) {
      const adv = (ADV[ch] ?? 0.55) * size + ls;
      if (ch === ' ') {
        x += adv;
        continue;
      }
      const nao = NAO.has(idx);
      const level = nao ? 100 : (o.levels[idx] ?? 100);
      ctx.font = `${nao ? 'italic ' : ''}400 ${size}px ${FAMILY[level] ?? FAMILY[0]}`;
      ctx.fillStyle = nao ? CALANGO : OSSO;
      const w = ctx.measureText(ch).width;
      // a letra degradada fica centrada na largura da letra limpa: nada se mexe
      ctx.fillText(ch, x + (adv - ls - w) / 2, base);
      x += adv;
      idx++;
    }
  });
  y = baselines[baselines.length - 1] + size * 0.32;

  // fio + autoria
  ctx.fillStyle = CALANGO;
  ctx.fillRect(x0, y, size * 0.5, Math.max(2, size * 0.022));
  y += size * 0.3;
  const sub = 0.026 * unit;
  ctx.font = `700 ${sub}px ${MONO}`;
  setSpacing(ctx, sub * 0.06);
  ctx.fillStyle = OSSO;
  ctx.fillText('UMA EXPOSIÇÃO DE LUCAS LOPES', x0, y);
  ctx.font = `400 ${sub * 0.78}px ${MONO}`;
  ctx.fillStyle = 'rgba(232,227,215,0.7)';
  ctx.fillText('ABIGOS FR · PORTO ALEGRE · 2026', x0, y + sub * 1.25);
  y += sub * 1.25 + 0.06 * unit;

  // chamada
  const ps = 0.029 * unit;
  ctx.font = `700 ${ps}px ${MONO}`;
  setSpacing(ctx, ps * 0.14);
  const label = `[ ${o.prompt} ]`;
  const pw = ctx.measureText(label).width;
  ctx.fillStyle = OSSO;
  ctx.fillText(label, x0, y);
  // cursor de bloco
  ctx.fillStyle = CALANGO;
  ctx.fillRect(x0 + pw + ps * 0.4, y - ps * 0.82, ps * 0.62, ps * 0.95);
  setSpacing(ctx, 0);

  const titleW = Math.max(...TITLE_LINES.map((l) => [...l].reduce((a, ch) => a + (ADV[ch] ?? 0.55) * size + ls, 0)));
  const pr: [number, number, number, number] = [
    (x0 - ps * 0.3) / W,
    1 - (y + ps * 0.4) / H,
    (x0 + pw + ps * 1.3) / W,
    1 - (y - ps * 1.1) / H,
  ];
  return {
    prompt: pr,
    quiet: [x0 / W - 0.02, (titleTop - (o.crest ? L.crestH * unit : 0)) / H - 0.05, (titleW + 0.06 * unit) / W, (y - titleTop + L.crestH * unit) / H + 0.1],
    focus: [(x0 + titleW * 0.4) / W, 1 - (titleTop + size) / H],
  };
}
