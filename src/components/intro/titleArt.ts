// Camada "impressa no vidro" da title screen: escudo + título + assinatura do autor.
// O "NÃO" é vazado (só contorno): a ausência desenhada. No fechamento do site ele desaparece.

const OSSO = '#E8E3D7';
const CALANGO = '#7CD93B';

export interface TitleLayout {
  /** retângulo do bloco do título em px CSS, para posicionar elementos DOM em volta */
  block: { x: number; y: number; w: number; h: number };
  promptY: number;
  align: 'left' | 'center';
}

function lumaKey(img: HTMLImageElement, size: number) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = Math.round((img.naturalHeight / img.naturalWidth) * size);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const p = data.data;
  for (let i = 0; i < p.length; i += 4) {
    const m = Math.max(p[i], p[i + 1], p[i + 2]);
    p[i + 3] = Math.max(0, Math.min(255, (m - 14) * 3.2));
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

export function drawTitleArt(canvas: HTMLCanvasElement, crest: HTMLImageElement | null, cssW: number, cssH: number, dpr: number): TitleLayout {
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const wide = cssW / cssH > 1.05;
  const align: TitleLayout['align'] = wide ? 'left' : 'center';
  const titleSize = wide ? Math.min(cssH * 0.15, cssW * 0.105) : Math.min(cssW * 0.205, cssH * 0.105);
  const crestH = wide ? titleSize * 1.55 : titleSize * 1.7;
  const gap = titleSize * 0.32;
  const subSize = Math.max(10, titleSize * 0.13);
  const blockH = crestH + gap + titleSize * 1.86 + gap * 0.9 + subSize;
  const x0 = wide ? cssW * 0.075 : cssW / 2;
  let y = wide ? (cssH - blockH) / 2 - cssH * 0.02 : cssH * 0.17;

  // escudo
  if (crest) {
    const keyed = lumaKey(crest, Math.round(crestH * dpr * 1.2));
    const cw = crestH * (keyed.width / keyed.height);
    const cx = wide ? x0 - cw * 0.06 : x0 - cw / 2;
    ctx.globalAlpha = 0.96;
    ctx.drawImage(keyed, cx, y, cw, crestH);
    ctx.globalAlpha = 1;
  }
  y += crestH + gap;

  // título
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const font = `900 extra-condensed ${titleSize}px "Anybody Variable", "Arial Narrow", sans-serif`;
  ctx.font = font;
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${-titleSize * 0.01}px`;

  const line1 = 'TUDO O QUE';
  const nao = 'NÃO';
  const somos = ' SOMOS';
  const w1 = ctx.measureText(line1).width;
  const wNao = ctx.measureText(nao).width;
  const w2 = wNao + ctx.measureText(somos).width;
  const blockW = Math.max(w1, w2);

  const lx1 = wide ? x0 : x0 - w1 / 2;
  const lx2 = wide ? x0 : x0 - w2 / 2;
  const base1 = y + titleSize * 0.82;
  const base2 = base1 + titleSize * 0.92;

  ctx.fillStyle = OSSO;
  ctx.fillText(line1, lx1, base1);
  ctx.strokeStyle = OSSO;
  ctx.lineWidth = Math.max(1.2, titleSize * 0.014);
  ctx.strokeText(nao, lx2, base2);
  ctx.fillText(somos, lx2 + wNao, base2);

  // marcador calango sob o título
  const yLine = base2 + titleSize * 0.2;
  ctx.fillStyle = CALANGO;
  ctx.fillRect(wide ? x0 : x0 - blockW / 2, yLine, titleSize * 0.42, Math.max(2, titleSize * 0.025));

  // subtítulo
  ctx.font = `400 ${subSize}px "Martian Mono Variable", monospace`;
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${subSize * 0.22}px`;
  const sub = 'ABIGOS FR — POR LUCAS LOPES';
  const sw = ctx.measureText(sub).width;
  ctx.fillStyle = OSSO;
  ctx.globalAlpha = 0.86;
  ctx.fillText(sub, wide ? x0 : x0 - sw / 2, yLine + gap * 0.9 + subSize);
  ctx.globalAlpha = 1;

  const top = wide ? (cssH - blockH) / 2 - cssH * 0.02 : cssH * 0.17;
  return {
    block: { x: wide ? x0 : x0 - blockW / 2, y: top, w: blockW, h: blockH },
    promptY: top + blockH + titleSize * 0.7,
    align,
  };
}
