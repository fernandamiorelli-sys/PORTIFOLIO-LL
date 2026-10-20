import * as THREE from 'three';

// Partículas da transformação: cada caractere do calango ASCII vira um ponto que voa até a pele do
// calango 3D (na ordem da espinha, da cabeça à cauda). No fim do site, o caminho inverso: a pele
// do calango se desfaz em pontos que entram no patch da camisa.

const CHARS = ' .:-=+*#%@·01<>/\\|{}[]$&~^ABCDEFGHIJKLMNOPQRSTUVWXYZ';

let atlas: THREE.CanvasTexture | null = null;
const GRID = 8;

function glyphAtlas() {
  if (atlas) return atlas;
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const cell = size / GRID;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${cell * 0.92}px "Courier Prime", "Courier New", monospace`;
  [...CHARS].forEach((ch, i) => {
    const x = (i % GRID) * cell + cell / 2;
    const y = Math.floor(i / GRID) * cell + cell / 2;
    ctx.fillText(ch, x, y);
  });
  atlas = new THREE.CanvasTexture(c);
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.generateMipmaps = true;
  return atlas;
}

export const glyphIndex = (ch: string) => Math.max(0, CHARS.indexOf(ch));

const VERT = /* glsl */ `
uniform float uT;
uniform float uTime;
uniform float uPx;
uniform float uFlight;
uniform vec3 uCarry;
attribute vec3 aStart;
attribute vec3 aEnd;
attribute vec4 aInfo; // atraso, glifo, semente, tamanho (px)
varying float vAlpha;
varying float vGlyph;
varying float vHeat;
varying float vK;
void main() {
  float k = clamp((uT - aInfo.x) / uFlight, 0.0, 1.0);
  float e = k * k * (3.0 - 2.0 * k);
  vec3 p = mix(aStart, aEnd, e);
  float arc = sin(e * 3.14159265);
  // sobe na direção da câmera no meio do voo e redemoinha
  p.z += arc * (90.0 + aInfo.z * 120.0);
  p.xy += vec2(sin(aInfo.z * 61.0 + uTime * 2.3), cos(aInfo.z * 47.0 + uTime * 1.9)) * arc * (10.0 + aInfo.w * 1.2);
  p += uCarry;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aInfo.w * mix(1.0, 0.32, e) * uPx;
  vAlpha = 1.0 - smoothstep(0.78, 1.0, k);
  vGlyph = aInfo.y;
  vHeat = arc;
  vK = k;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uFade;
varying float vAlpha;
varying float vGlyph;
varying float vHeat;
varying float vK;
void main() {
  float g = floor(vGlyph + 0.5);
  vec2 cell = vec2(mod(g, ${GRID}.0), floor(g / ${GRID}.0));
  vec2 uv = (cell + vec2(gl_PointCoord.x, gl_PointCoord.y)) / ${GRID}.0;
  uv.y = 1.0 - uv.y;
  float glyph = texture2D(uAtlas, uv).a;
  // no voo, o caractere vira um ponto de luz
  float d = length(gl_PointCoord - 0.5);
  float dot = smoothstep(0.5, 0.15, d);
  float shape = mix(glyph, dot, smoothstep(0.05, 0.4, vK));
  vec3 green = vec3(0.486, 0.851, 0.231);
  vec3 hot = vec3(0.92, 1.0, 0.9);
  vec3 col = mix(green, hot, vHeat);
  float a = shape * vAlpha * uFade;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col * a, a);
}`;

export interface ParticleSpec {
  start: Float32Array; // xyz
  end: Float32Array; // xyz
  info: Float32Array; // delay, glyph, seed, size
}

export function createParticles(spec: ParticleSpec, flight = 0.3) {
  const g = new THREE.BufferGeometry();
  const n = spec.start.length / 3;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aStart', new THREE.BufferAttribute(spec.start, 3));
  g.setAttribute('aEnd', new THREE.BufferAttribute(spec.end, 3));
  g.setAttribute('aInfo', new THREE.BufferAttribute(spec.info, 4));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uT: { value: 0 },
      uTime: { value: 0 },
      uPx: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uFlight: { value: flight },
      uCarry: { value: new THREE.Vector3() },
      uAtlas: { value: glyphAtlas() },
      uFade: { value: 1 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const points = new THREE.Points(g, material);
  points.frustumCulled = false;
  points.renderOrder = 20;
  return points;
}
