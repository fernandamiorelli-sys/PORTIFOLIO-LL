import * as THREE from 'three';

// Material do calango: cromo com película iridescente (o "chrome glass"), escamas procedurais
// geradas no shader a partir da posição de repouso de cada ponto (então elas acompanham a pele
// quando ele anda), e uma dissolução com borda acesa para materializar e desmaterializar.

export interface CalangoUniforms {
  uReveal: { value: number };
  uDissolveDir: { value: number };
  uEdgeColor: { value: THREE.Color };
  uBumpPx: { value: number };
  uScales: { value: number };
}

const PARS = /* glsl */ `
varying vec3 vRest;
varying vec4 vRegion;
uniform float uReveal;
uniform float uDissolveDir;
uniform vec3 uEdgeColor;
uniform float uBumpPx;
uniform float uScales;

vec3 cHash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}

float cHash1(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
}

float cNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(cHash1(i), cHash1(i + vec3(1, 0, 0)), f.x), mix(cHash1(i + vec3(0, 1, 0)), cHash1(i + vec3(1, 1, 0)), f.x), f.y);
  float b = mix(mix(cHash1(i + vec3(0, 0, 1)), cHash1(i + vec3(1, 0, 1)), f.x), mix(cHash1(i + vec3(0, 1, 1)), cHash1(i + vec3(1, 1, 1)), f.x), f.y);
  return mix(a, b, f.z);
}

// F1, F2 e o vetor do ponto até o centro da escama mais próxima
vec2 cVoronoi(vec3 p, out vec3 rel) {
  vec3 ip = floor(p);
  vec3 fp = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  rel = vec3(0.0);
  for (int k = -1; k <= 1; k++)
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec3 g = vec3(float(i), float(j), float(k));
    vec3 o = cHash3(ip + g) * 0.72 + 0.14;
    vec3 r = g + o - fp;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; rel = -r; }
    else if (d < f2) { f2 = d; }
  }
  return vec2(sqrt(f1), sqrt(f2));
}

// altura da pele: escamas em domo e quilhadas no dorso, placas na cabeça,
// ventrais lisas e maiores, granulares nos membros, verticilos na cauda
float cScales(vec3 p, vec4 reg, out float plate, out float cells) {
  // um pouco maiores que as reais (≈ 70 dorsais entre a nuca e a cloaca): na tela, elas precisam aparecer
  float size = 0.0165;
  size = mix(size, 0.0245, reg.y);
  size = mix(size, 0.0115, reg.z);
  size = mix(size, 0.0300, reg.x);
  vec3 q = p / size;
  q.y *= 0.82;
  vec3 rel;
  vec2 f = cVoronoi(q, rel);
  // sulco fino entre as escamas
  plate = smoothstep(0.0, 0.13, f.y - f.x);
  // cada escama é um domo baixo; a imbricação inclina o domo para trás
  float dome = 1.0 - smoothstep(0.0, 0.78, length(rel.xz) * 1.1 + max(0.0, rel.y) * 0.5);
  float imb = clamp(0.5 + rel.y * 0.9, 0.0, 1.0);
  float keelMask = (1.0 - reg.y) * (1.0 - reg.x) * (1.0 - reg.z * 0.7);
  float keel = exp(-rel.x * rel.x * 34.0) * smoothstep(0.55, 0.0, abs(rel.y)) * keelMask;
  float ring = reg.w * (1.0 - reg.z) * (1.0 - smoothstep(0.0, 0.06, abs(fract(p.y / 0.026) - 0.5) - 0.44));
  // quantas escamas cabem em um pixel: some quando ficariam pequenas demais (sem cintilação)
  float px = length(fwidth(p)) + 1e-6;
  cells = size / px;
  float head = mix(0.55 + 0.25 * dome, 0.62, reg.x);
  return plate * (head + 0.2 * mix(imb, 0.5, reg.x) + 0.32 * keel) - ring * 0.5;
}

vec3 cPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDirection) {
  vec3 sx = dFdx(surfPos);
  vec3 sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDirection;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

/**
 * Íris do calango, para a esfera do olho (mapa equirretangular: o polo +Y é o centro da pupila).
 * Pupila redonda e preta, um anel dourado fino em volta dela e a íris marrom-escura com estrias,
 * como no Tropidurus. O resto da esfera fica escondido na órbita.
 */
function irisTexture() {
  const w = 256;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const row = (deg: number) => (deg / 180) * h;
  g.fillStyle = '#030303';
  g.fillRect(0, 0, w, h);
  // íris: marrom-escura, mais quente perto da pupila, com estrias radiais (colunas no mapa)
  const iris = g.createLinearGradient(0, row(17), 0, row(44));
  iris.addColorStop(0, '#6b4420');
  iris.addColorStop(0.35, '#3d2614');
  iris.addColorStop(1, '#1a110a');
  g.fillStyle = iris;
  g.fillRect(0, row(17), w, row(44) - row(17));
  for (let x = 0; x < w; x += 2) {
    const k = Math.sin(x * 0.37) * 0.5 + Math.sin(x * 1.31 + 1.7) * 0.5;
    g.fillStyle = k > 0 ? `rgba(160, 110, 55, ${0.12 * k})` : `rgba(0, 0, 0, ${-0.22 * k})`;
    g.fillRect(x, row(19), 2, row(42) - row(19));
  }
  // anel dourado em volta da pupila e o contorno escuro da íris
  g.fillStyle = '#c99a3e';
  g.fillRect(0, row(15), w, row(18.5) - row(15));
  g.fillStyle = '#0b0805';
  g.fillRect(0, row(41), w, row(46) - row(41));
  // pupila
  g.fillStyle = '#010101';
  g.fillRect(0, 0, w, row(15));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createCalangoMaterials(opts: { scales: boolean }) {
  const uniforms: CalangoUniforms = {
    uReveal: { value: 1 },
    uDissolveDir: { value: 1 },
    uEdgeColor: { value: new THREE.Color('#9dff5c') },
    uBumpPx: { value: 0.5 },
    uScales: { value: opts.scales ? 1 : 0 },
  };

  const body = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#d9e3dc'),
    metalness: 1,
    roughness: 0.2,
    clearcoat: 0.55,
    clearcoatRoughness: 0.06,
    iridescence: 0.55,
    iridescenceIOR: 1.65,
    iridescenceThicknessRange: [240, 720],
    envMapIntensity: 2.0,
  });

  body.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 region;\nvarying vec3 vRest;\nvarying vec4 vRegion;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;\nvRegion = region;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PARS}`)
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        // dissolução: da cabeça para a cauda (ou o contrário), com borda irregular
        float cOrder = clamp((1.0 - vRest.y) / 2.5, 0.0, 1.0);
        if (uDissolveDir < 0.0) cOrder = 1.0 - cOrder;
        float cTh = uReveal * 1.3 - 0.15;
        float cV = cOrder + (cNoise(vRest * 46.0) - 0.5) * 0.14;
        if (cV > cTh) discard;
        float cEdge = (1.0 - smoothstep(0.0, 0.035, cTh - cV)) * step(uReveal, 0.999);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float cPlate = 1.0;
        float cCells = 0.0;
        float cH = 0.0;
        if (uScales > 0.5) {
          cH = cScales(vRest, vRegion, cPlate, cCells);
          float cFade = smoothstep(1.7, 4.2, cCells);
          cH *= cFade;
          roughnessFactor = mix(roughnessFactor + 0.22 * cFade, roughnessFactor, cPlate);
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        if (uScales > 0.5) {
          vec2 cD = vec2(dFdx(cH), dFdy(cH)) * uBumpPx;
          normal = cPerturb(-vViewPosition, normal, cD, faceDirection);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += uEdgeColor * cEdge * 2.4;
        // borda vítrea: um véu verde fraco no contorno, como vidro sobre o cromo
        float cRim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
        totalEmissiveRadiance += vec3(0.32, 0.62, 0.36) * cRim * 0.22;`,
      );
  };
  body.customProgramCacheKey = () => 'calango-body-v1';

  const eye = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffffff'),
    map: irisTexture(),
    metalness: 0,
    roughness: 0.035,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    ior: 1.75,
    specularIntensity: 1,
    envMapIntensity: 2.6,
  });

  const lid = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#d9e3dc'),
    metalness: 1,
    roughness: 0.24,
    iridescence: 0.4,
    envMapIntensity: 1.8,
  });

  return { body, eye, lid, uniforms };
}
