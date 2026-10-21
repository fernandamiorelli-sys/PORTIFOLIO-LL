import { CALANGO_SILHOUETTE } from '../../assets/calango';
import type { GlassHeader } from './asset';
import type { GlassRenderer } from './glassRenderer';

// O contorno do logo nas coordenadas da peça 3D: serve ao data overlay (a caixa justa em volta) e a
// saber se o cursor está em cima do calango (frente, verso e as paredes entre eles, projetados).

/** ponto do viewBox do logo → coordenadas do modelo (altura 1, y para cima, frente em +z) */
export function modelPoint(header: GlassHeader, x: number, y: number, z = header.halfDepth): [number, number, number] {
  const [cx, cy] = header.center;
  return [(x - cx) * header.scale, -(y - cy) * header.scale, z];
}

/** n pontos do contorno, cada um na frente e no verso: [frente0, verso0, frente1, verso1, ...] */
export function outlineModel(header: GlassHeader, n: number) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', CALANGO_SILHOUETTE);
  const len = path.getTotalLength();
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = path.getPointAtLength((i / n) * len);
    out.push(...modelPoint(header, p.x, p.y, header.halfDepth), ...modelPoint(header, p.x, p.y, -header.halfDepth));
  }
  return out;
}

/** par-ímpar: o ponto está dentro do polígono (xs/ys em px, n vértices a partir de `at`, passo `step`) */
function inside(px: number, py: number, s: Float32Array, at: number, step: number, n: number) {
  let hit = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = s[(at + i * step) * 2];
    const yi = s[(at + i * step) * 2 + 1];
    const xj = s[(at + j * step) * 2];
    const yj = s[(at + j * step) * 2 + 1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** a silhueta projetada da peça, na pose atual, para o cursor */
export class HitShape {
  private model: Float32Array;
  private scr: Float32Array;
  private n: number;
  private quad = new Float32Array(8);
  /** caixa da silhueta projetada (px do palco) */
  box = { x0: 0, y0: 0, x1: 0, y1: 0 };

  constructor(header: GlassHeader, n = 64) {
    this.n = n;
    this.model = new Float32Array(outlineModel(header, n));
    this.scr = new Float32Array(n * 4);
  }

  update(glass: GlassRenderer) {
    glass.project(this.model, this.scr);
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (let i = 0; i < this.n * 2; i++) {
      b.x0 = Math.min(b.x0, this.scr[i * 2]);
      b.x1 = Math.max(b.x1, this.scr[i * 2]);
      b.y0 = Math.min(b.y0, this.scr[i * 2 + 1]);
      b.y1 = Math.max(b.y1, this.scr[i * 2 + 1]);
    }
    this.box = b;
  }

  /** dentro da caixa, com folga (px) */
  inBox(x: number, y: number, pad: number) {
    const b = this.box;
    return x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad;
  }

  /** dentro da silhueta: frente, verso ou alguma parede entre os dois */
  contains(x: number, y: number) {
    if (!this.inBox(x, y, 0)) return false;
    const s = this.scr;
    const n = this.n;
    if (inside(x, y, s, 0, 2, n) || inside(x, y, s, 1, 2, n)) return true;
    const quad = this.quad;
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      // frente i, frente i+1, verso i+1, verso i
      quad.set([s[i * 4], s[i * 4 + 1], s[k * 4], s[k * 4 + 1], s[k * 4 + 2], s[k * 4 + 3], s[i * 4 + 2], s[i * 4 + 3]]);
      if (inside(x, y, quad, 0, 1, 4)) return true;
    }
    return false;
  }
}
