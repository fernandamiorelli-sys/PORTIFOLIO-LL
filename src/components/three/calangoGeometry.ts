import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CALANGO_FILL, CALANGO_SILHOUETTE, CALANGO_SPINE, CALANGO_VIEWBOX } from '../../assets/calango';

// Geometria do calango em duas camadas extrudadas a partir do mascote vetorizado:
//  grupo 0: base (silhueta cheia)  → cromo, aparece no bisel, nas listras e no olho
//  grupo 1: corpo (preenchimento)  → vidro verde, um pouco mais espesso, por cima da base
// Unidades finais: altura do desenho = 1.

function shapes(d: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="#000" fill-rule="evenodd"/></svg>`;
  const data = new SVGLoader().parse(svg);
  return data.paths.flatMap((p) => p.toShapes());
}

export interface CalangoBuild {
  geometry: THREE.BufferGeometry;
  bones: THREE.Bone[];
  /** pontos da espinha em espaço do modelo */
  spine: THREE.Vector2[];
  size: { width: number; height: number };
}

export function buildCalango(detail: 'high' | 'low' = 'high'): CalangoBuild {
  const H = CALANGO_VIEWBOX.height;
  const W = CALANGO_VIEWBOX.width;
  const curveSegments = detail === 'high' ? 4 : 2;
  const baseDepth = 16;
  const lift = 3.2;

  const base = new THREE.ExtrudeGeometry(shapes(CALANGO_SILHOUETTE), {
    depth: baseDepth,
    bevelEnabled: true,
    bevelThickness: 5,
    bevelSize: 3.4,
    bevelOffset: -3.4,
    bevelSegments: detail === 'high' ? 4 : 2,
    curveSegments,
  });
  base.translate(0, 0, -baseDepth / 2);

  const fillDepth = baseDepth + lift * 2;
  const body = new THREE.ExtrudeGeometry(shapes(CALANGO_FILL), {
    depth: fillDepth,
    bevelEnabled: true,
    bevelThickness: 3,
    bevelSize: 1.4,
    bevelOffset: -1.4,
    bevelSegments: detail === 'high' ? 4 : 2,
    curveSegments,
  });
  body.translate(0, 0, -fillDepth / 2);

  // ExtrudeGeometry gera índices; mergeGeometries exige consistência
  const merged = mergeGeometries([base, body], true)!;
  base.dispose();
  body.dispose();

  // pesos de pele: cada vértice segue o segmento de espinha mais próximo (em coordenadas do SVG)
  const pos = merged.getAttribute('position') as THREE.BufferAttribute;
  const n = CALANGO_SPINE.length;
  const skinIndex = new Uint16Array(pos.count * 4);
  const skinWeight = new Float32Array(pos.count * 4);
  for (let v = 0; v < pos.count; v++) {
    const px = pos.getX(v);
    const py = pos.getY(v);
    let best = Infinity;
    let seg = 0;
    let segT = 0;
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
        seg = i;
        segT = t;
      }
    }
    skinIndex[v * 4] = seg;
    skinIndex[v * 4 + 1] = Math.min(n - 1, seg + 1);
    skinWeight[v * 4] = 1 - segT;
    skinWeight[v * 4 + 1] = segT;
  }
  merged.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  merged.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));

  // SVG (y para baixo) → three (y para cima), centralizado, altura 1.
  // rotateX(π) inverte y e z juntos: preserva a orientação das faces (escala negativa não).
  const cx = W / 2;
  const cy = H / 2;
  merged.translate(-cx, -cy, 0);
  merged.rotateX(Math.PI);
  merged.scale(1 / H, 1 / H, 1 / H);
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();

  const spine = CALANGO_SPINE.map(([x, y]) => new THREE.Vector2((x - cx) / H, -(y - cy) / H));
  const bones: THREE.Bone[] = [];
  spine.forEach((p, i) => {
    const bone = new THREE.Bone();
    if (i === 0) bone.position.set(p.x, p.y, 0);
    else bone.position.set(p.x - spine[i - 1].x, p.y - spine[i - 1].y, 0);
    if (i > 0) bones[i - 1].add(bone);
    bones.push(bone);
  });

  return { geometry: merged, bones, spine, size: { width: W / H, height: 1 } };
}
