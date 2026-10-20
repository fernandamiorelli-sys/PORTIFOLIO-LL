import * as THREE from 'three';

// Carrega a malha esculpida por scripts/sculpt-calango.py (public/media/3d/calango.bin).
// Formato: 'CLNG' · u32 tamanho do cabeçalho · JSON · posições f32x3 · normais i16x4 · regiões u8x4 ·
// índices de osso u8x4 · pesos u8x4 · índices de triângulo. Unidades: CRC (rostro-cloacal) = 1.

export type LimbKey = 'front.L' | 'front.R' | 'hind.L' | 'hind.R';

interface Header {
  vertexCount: number;
  indexCount: number;
  indexType: 'uint16' | 'uint32';
  bones: { name: string; parent: number; position: [number, number, number] }[];
  limbs: Record<LimbKey, [number, number, number]>;
  eyes: { center: [number, number, number]; radius: number; axis: [number, number, number] }[];
  bbox: [[number, number, number], [number, number, number]];
}

export interface CalangoAsset {
  geometry: THREE.BufferGeometry;
  header: Header;
  /** posição de repouso absoluta de cada osso (espaço do modelo) */
  rest: THREE.Vector3[];
  boneIndex: Record<string, number>;
}

let cache: Promise<CalangoAsset> | null = null;

export function loadCalango(url = '/media/3d/calango.bin'): Promise<CalangoAsset> {
  if (cache) return cache;
  cache = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`calango: ${r.status}`);
      return r.arrayBuffer();
    })
    .then((buf) => {
      const dv = new DataView(buf);
      const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
      if (magic !== 'CLNG') throw new Error('calango: formato');
      const hlen = dv.getUint32(4, true);
      const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hlen))) as Header;
      const nv = header.vertexCount;
      let o = 8 + hlen;
      const position = new Float32Array(buf, o, nv * 3);
      o += nv * 12;
      const normal = new Int16Array(buf, o, nv * 4);
      o += nv * 8;
      const region = new Uint8Array(buf, o, nv * 4);
      o += nv * 4;
      const skinIndex = new Uint8Array(buf, o, nv * 4);
      o += nv * 4;
      const skinWeight = new Uint8Array(buf, o, nv * 4);
      o += nv * 4;
      const index = header.indexType === 'uint16' ? new Uint16Array(buf, o, header.indexCount) : new Uint32Array(buf, o, header.indexCount);

      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(position, 3));
      const nbuf = new THREE.InterleavedBuffer(normal, 4);
      g.setAttribute('normal', new THREE.InterleavedBufferAttribute(nbuf, 3, 0, true));
      g.setAttribute('region', new THREE.BufferAttribute(region, 4, true));
      g.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4, true));
      g.setIndex(new THREE.BufferAttribute(index, 1));
      const [lo, hi] = header.bbox;
      g.boundingBox = new THREE.Box3(new THREE.Vector3(...lo), new THREE.Vector3(...hi));
      g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());

      const rest = header.bones.map((b) => new THREE.Vector3(...b.position));
      const boneIndex: Record<string, number> = {};
      header.bones.forEach((b, i) => (boneIndex[b.name] = i));
      return { geometry: g, header, rest, boneIndex };
    });
  cache.catch(() => (cache = null));
  return cache;
}

/** Cria um esqueleto novo (em repouso) para o asset. */
export function makeSkeleton(asset: CalangoAsset) {
  const bones = asset.header.bones.map((b) => {
    const bone = new THREE.Bone();
    bone.name = b.name;
    return bone;
  });
  asset.header.bones.forEach((b, i) => {
    const bone = bones[i];
    const p = asset.rest[i];
    if (b.parent >= 0) {
      bone.position.copy(p).sub(asset.rest[b.parent]);
      bones[b.parent].add(bone);
    } else bone.position.copy(p);
  });
  return bones;
}
