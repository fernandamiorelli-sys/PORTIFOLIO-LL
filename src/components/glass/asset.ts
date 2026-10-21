import * as THREE from 'three';

// Calango de vidro (gerado por scripts/glass-calango.py): malha do logo extrudado e o mapa de campo
// que dá a normal exata de cada pixel (as metades do PNG viram duas texturas). O site baixa as versões
// menores e sem perda (a malha em gzip, o mapa em WebP); navegador antigo cai no .bin e no PNG.

export interface GlassHeader {
  version: number;
  vertexCount: number;
  indexCount: number;
  indexType: 'uint16' | 'uint32';
  viewBox: [number, number];
  center: [number, number];
  scale: number;
  halfDepth: number;
  bevel: number;
  bbox: [[number, number, number], [number, number, number]];
  field: { texels: [number, number]; min: [number, number]; max: [number, number]; wall: number };
}

export interface GlassAsset {
  geometry: THREE.BufferGeometry;
  header: GlassHeader;
  /** direção para fora da borda (metade esquerda do PNG) */
  fieldOut: THREE.Texture;
  /** inclinação da face: chanfro + sulcos do olho e das listras (metade direita) */
  fieldSlope: THREE.Texture;
}

const BASE = '/media/3d/calango-vidro';
/** a Vercel guarda /media por um ano: ao gerar a peça de novo (scripts/glass-calango.py), suba a versão */
const VERSION = 1;
let cache: Promise<GlassAsset> | null = null;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`falhou ${src}`));
    img.src = src;
  });
}

/** a malha: o .bin em gzip, descomprimido aqui (a Vercel não comprime .bin); sem DecompressionStream,
 *  o .bin cru. Se algum servidor no caminho já tiver descomprimido, os bytes chegam crus e servem igual */
async function loadMesh() {
  const gz = typeof DecompressionStream !== 'undefined';
  const r = await fetch(`${BASE}.bin${gz ? '.gz' : ''}?v=${VERSION}`);
  if (!r.ok) throw new Error(`calango-vidro.bin: ${r.status}`);
  const buf = await r.arrayBuffer();
  const head = new Uint8Array(buf, 0, 2);
  if (head[0] !== 0x1f || head[1] !== 0x8b) return buf;
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

function half(img: HTMLImageElement, right: boolean) {
  const w = Math.floor(img.naturalWidth / 2);
  const h = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.drawImage(img, right ? w : 0, 0, w, h, 0, 0, w, h);
  const t = new THREE.CanvasTexture(c);
  // é dado, não cor: sem conversão de espaço de cor, linha 0 em cima (o shader conta assim)
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = false;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

export function loadGlassCalango(): Promise<GlassAsset> {
  if (cache) return cache;
  cache = (async () => {
    const [buf, img] = await Promise.all([
      loadMesh(),
      // o WebP sem perda tem os mesmos valores do PNG; o PNG só para navegador sem WebP
      loadImage(`${BASE}-campo.webp?v=${VERSION}`).catch(() => loadImage(`${BASE}-campo.png?v=${VERSION}`)),
    ]);
    const magic = new TextDecoder().decode(new Uint8Array(buf, 0, 4));
    if (magic !== 'CLGV') throw new Error('calango-vidro.bin inválido');
    const hlen = new DataView(buf).getUint32(4, true);
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hlen))) as GlassHeader;
    const n = header.vertexCount;
    let o = 8 + hlen;
    const position = new Float32Array(buf, o, n * 3);
    o += n * 12;
    const normal = new Int8Array(buf, o, n * 4);
    o += n * 4;
    const index = header.indexType === 'uint16' ? new Uint16Array(buf, o, header.indexCount) : new Uint32Array(buf, o, header.indexCount);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 4, true));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    const [lo, hi] = header.bbox;
    geometry.boundingBox = new THREE.Box3(new THREE.Vector3(...lo), new THREE.Vector3(...hi));
    geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
    return { geometry, header, fieldOut: half(img, false), fieldSlope: half(img, true) };
  })();
  cache.catch(() => (cache = null));
  return cache;
}
