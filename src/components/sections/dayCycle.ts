import type { DayPhase } from '../../data/pieces';

// Um dia no sertão: a sala Sangue-Frio muda de cor conforme a hora de cada peça.
// Tons lavados (soft club), nada saturado: é luz, não paleta nova.

export interface Sky {
  bg: string;
  sun: string;
  /** posição do sol em % da tela */
  x: number;
  y: number;
  /** diâmetro em vh */
  size: number;
  alpha: number;
}

export const PRE: Sky = { bg: '#070807', sun: '#6a7c96', x: 12, y: 96, size: 30, alpha: 0 };

export const SKIES: Record<DayPhase, Sky> = {
  amanhecer: { bg: '#e4dacb', sun: '#f6d7b0', x: 14, y: 78, size: 58, alpha: 0.95 },
  'meio-dia': { bg: '#edefe9', sun: '#ffffff', x: 50, y: 14, size: 74, alpha: 0.9 },
  tarde: { bg: '#d3cbbb', sun: '#f2dcb0', x: 78, y: 34, size: 56, alpha: 0.85 },
  crepusculo: { bg: '#2a2a33', sun: '#d1885a', x: 86, y: 82, size: 50, alpha: 0.75 },
  noite: { bg: '#0a1424', sun: '#9db0c8', x: 80, y: 18, size: 18, alpha: 0.55 },
  estudio: { bg: '#070807', sun: '#7cd93b', x: 50, y: 120, size: 40, alpha: 0 },
};

export const PHASE_LABEL: Record<DayPhase, string> = {
  amanhecer: 'Amanhecer',
  'meio-dia': 'Meio-dia',
  tarde: 'Tarde',
  crepusculo: 'Crepúsculo',
  noite: 'Noite',
  estudio: 'Madrugada · estúdio',
};

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

export function mixColor(a: string, b: string, t: number) {
  const A = hex(a);
  const B = hex(b);
  return toHex(A.map((v, i) => v + (B[i] - v) * t));
}

export function mixSky(a: Sky, b: Sky, t: number): Sky {
  return {
    bg: mixColor(a.bg, b.bg, t),
    sun: mixColor(a.sun, b.sun, t),
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    size: a.size + (b.size - a.size) * t,
    alpha: a.alpha + (b.alpha - a.alpha) * t,
  };
}

export function luminance(color: string) {
  const [r, g, b] = hex(color).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** Interpola o relógio entre duas peças (passando da meia-noite quando precisa). */
export function mixClock(a: string, b: string, t: number) {
  const A = toMinutes(a);
  let B = toMinutes(b);
  if (B < A) B += 24 * 60;
  const m = Math.round(A + (B - A) * t) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
