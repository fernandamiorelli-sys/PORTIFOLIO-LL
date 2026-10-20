// Renderizador WebGL da title screen.
// Uma tela de vidro de verdade, enquadrada em 3/4: o painel recua para a direita, a borda distante aparece,
// os dados correm numa camada de LCD atrás do vidro (com paralaxe), o título está impresso no vidro,
// e a lente tem profundidade de campo, aberração cromática e grão. WebGL puro, sem three.js.

const QUAD_VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const SCENE_FRAG = `
precision highp float;
varying vec2 vUv;

uniform sampler2D uData;
uniform sampler2D uTitle;
uniform sampler2D uScratch;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uTan;          // tan(fov/2) em x e y
uniform vec3 uCamPos;
uniform mat3 uCam;          // colunas: direita, cima, trás
uniform vec3 uPC;           // centro do vidro
uniform vec3 uPU;           // eixo x do painel
uniform vec3 uPV;           // eixo y do painel
uniform vec3 uPN;           // normal (voltada para a câmera)
uniform vec2 uPH;           // meia largura / meia altura
uniform float uDepth;       // distância vidro → LCD
uniform vec4 uActive;       // área ativa do LCD (uv min, uv max)
uniform float uFocus;       // distância de foco
uniform float uAperture;
uniform vec3 uLight;        // luz que segue o mouse (mundo)
uniform float uReveal;      // impressão do título
uniform float uPower;       // LCD ligando
uniform vec4 uPrompt;       // retângulo do "aperte qualquer botão" (uv do vidro)
uniform float uPromptOn;
uniform float uGlitch;
uniform float uPx;          // ângulo de um pixel (rad)

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// caixa de luz retangular vista na direção do reflexo (em coordenadas do painel)
float softbox(vec3 r, vec3 c, vec3 t, vec2 size, float soft) {
  float d = dot(r, c);
  if (d <= 0.0) return 0.0;
  vec3 b = cross(c, t);
  vec2 q = vec2(dot(r, t), dot(r, b)) / d;
  vec2 e = smoothstep(size, size * (1.0 - soft), abs(q));
  return e.x * e.y;
}

vec3 environment(vec3 rl) {
  // o painel em 3/4 reflete direções com x local entre ~0.15 (esquerda) e ~0.85 (borda distante)
  vec3 col = vec3(0.010, 0.013, 0.011);
  // janela larga e suave, alta
  col += softbox(rl, normalize(vec3(0.34, 0.3, 0.88)), vec3(1.0, 0.0, 0.0), vec2(0.16, 0.22), 0.85) * vec3(0.32, 0.36, 0.34);
  // tira de luz fina e alta: o risco de luz que atravessa o vidro
  col += softbox(rl, normalize(vec3(0.58, 0.02, 0.81)), normalize(vec3(0.95, -0.12, -0.28)), vec2(0.03, 1.2), 0.92) * vec3(0.42, 0.5, 0.46);
  // segunda tira, mais fraca, para o reflexo não ser único
  col += softbox(rl, normalize(vec3(0.7, 0.0, 0.71)), normalize(vec3(0.7, -0.1, -0.7)), vec2(0.012, 1.2), 0.85) * vec3(0.22, 0.26, 0.24);
  // rebatedor do chão, quente e baixo
  col += softbox(rl, normalize(vec3(0.42, -0.36, 0.83)), vec3(1.0, 0.0, 0.0), vec2(0.4, 0.09), 0.9) * vec3(0.08, 0.075, 0.065);
  // néon verde distante, muito fraco
  col += softbox(rl, normalize(vec3(0.66, 0.27, 0.7)), vec3(1.0, 0.0, 0.0), vec2(0.2, 0.012), 0.5) * vec3(0.1, 0.36, 0.12);
  return col;
}

float rectMask(vec2 uv, vec4 r, float soft) {
  vec2 a = smoothstep(r.xy - soft, r.xy + soft, uv);
  vec2 b = smoothstep(r.zw + soft, r.zw - soft, uv);
  return a.x * a.y * b.x * b.y;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;

  // fatias de glitch deslocam a direção dos raios (a imagem toda "rasga")
  float slice = floor(vUv.y * 34.0);
  float tick = floor(uTime * 24.0);
  float g = uGlitch * step(0.6, hash(vec2(slice, tick)));
  ndc.x += g * (hash(vec2(slice + 4.7, tick)) - 0.5) * 0.12;

  vec3 ro = uCamPos;
  vec3 rd = normalize(uCam * vec3(ndc.x * uTan.x, ndc.y * uTan.y, -1.0));

  vec3 col = vec3(0.0);
  float denom = dot(rd, uPN);
  float tG = denom < -1e-4 ? dot(uPC - ro, uPN) / denom : -1.0;
  vec3 pG = ro + rd * max(tG, 0.0);
  vec2 lG = vec2(dot(pG - uPC, uPU), dot(pG - uPC, uPV));
  vec2 uvG = lG / (2.0 * uPH) + 0.5;
  bool onGlass = tG > 0.0 && all(greaterThanEqual(uvG, vec2(0.0))) && all(lessThanEqual(uvG, vec2(1.0)));

  // sala escura atrás do painel, com o vazamento de luz da tela
  vec2 outside = max(abs(lG) - uPH, 0.0);
  float spill = exp(-length(outside) * 2.2) * (tG > 0.0 ? 1.0 : 0.0);
  vec3 room = vec3(0.006, 0.008, 0.007) + vec3(0.03, 0.07, 0.04) * spill * uPower;
  room += vec3(0.012, 0.016, 0.014) * (1.0 - length(ndc) * 0.45);

  if (!onGlass) {
    col = room;
  } else {
    // ── LCD atrás do vidro (paralaxe real: outro plano)
    float tL = dot(uPC - uPN * uDepth - ro, uPN) / denom;
    vec3 pL = ro + rd * tL;
    vec2 uvL = vec2(dot(pL - uPC, uPU), dot(pL - uPC, uPV)) / (2.0 * uPH) + 0.5;
    vec2 dUv = (uvL - uActive.xy) / (uActive.zw - uActive.xy);
    float active = rectMask(uvL, uActive, 0.0015);

    // profundidade de campo: desfoque em pixels → viés de mip
    float blurL = uAperture * abs(1.0 / tL - 1.0 / uFocus) / uPx;
    float blurG = uAperture * abs(1.0 / tG - 1.0 / uFocus) / uPx;
    float lodL = log2(1.0 + blurL);
    float lodG = log2(1.0 + blurG);

    vec3 data = texture2D(uData, dUv, lodL).rgb;
    vec3 dataGlow = texture2D(uData, dUv, lodL + 4.0).rgb;
    float flicker = 0.94 + 0.06 * sin(uTime * 71.0 + dUv.y * 9.0);
    vec3 lcd = (data * 1.05 + dataGlow * 0.55) * active * uPower * flicker;
    // a borda preta do LCD e o vidro escuro por cima
    col = room * 0.35 + lcd * vec3(0.92, 1.0, 0.95);

    // ── vidro: riscos (R), manchas (G), poeira (B)
    vec4 scr = texture2D(uScratch, uvG, lodG * 0.6);
    float scratch = scr.r;
    float smudge = scr.g;
    float dust = scr.b;

    // ── impressão do título no vidro
    vec4 print = texture2D(uTitle, uvG, lodG);
    vec4 printGlow = texture2D(uTitle, uvG, lodG + 4.5);
    float blink = mix(1.0, uPromptOn, rectMask(uvG, uPrompt, 0.0005));
    float wear = clamp(1.0 - scratch * 0.55 - dust * 0.6, 0.0, 1.0);
    float pa = clamp(print.a * wear * uReveal * blink, 0.0, 1.0);
    col = mix(col, print.rgb, pa);
    col += printGlow.rgb * printGlow.a * 0.32 * uReveal * blink;

    // ── reflexos do estúdio, Fresnel e a luz do mouse nos riscos
    vec3 r = reflect(rd, uPN);
    vec3 rl = vec3(dot(r, uPU), dot(r, uPV), dot(r, uPN));
    float cosv = clamp(dot(-rd, uPN), 0.0, 1.0);
    float fres = 0.035 + 0.965 * pow(1.0 - cosv, 5.0);
    vec3 env = environment(rl);
    col += env * (fres * 1.6 + 0.05) * (1.0 - smudge * 0.4);
    col += env * smudge * 0.22;

    vec3 toL = uLight - pG;
    float dl = dot(toL, toL);
    float spot = exp(-dl * 7.5);
    float hot = exp(-dl * 70.0);
    col += vec3(0.86, 0.95, 0.89) * scratch * (0.035 + 1.25 * spot + length(env) * 0.9);
    col += vec3(0.6, 0.7, 0.64) * smudge * (0.015 + 0.2 * spot);
    col += vec3(0.95) * dust * (0.02 + 0.65 * spot);
    col += vec3(0.85, 0.95, 0.9) * (hot * 0.1 + spot * 0.025);

    // chanfro polido na borda do vidro: uma linha de luz (desfocada conforme a distância)
    vec2 edge = (uPH - abs(lG));
    float ed = min(edge.x, edge.y);
    float bevelW = 0.006 + blurG * uPx * tG * 0.8;
    float bevel = smoothstep(bevelW, 0.0, ed);
    col = mix(col, vec3(0.05, 0.06, 0.055) + env * 3.5 + vec3(0.18, 0.22, 0.2) * spill, bevel * 0.85);
  }

  gl_FragColor = vec4(col, 1.0);
}`;

const POST_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uRes;
uniform float uTime;
uniform float uGlitch;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 uv = vUv;
  vec2 c = uv - 0.5;
  float aspect = uRes.x / uRes.y;
  float r2 = dot(c * vec2(aspect, 1.0), c * vec2(aspect, 1.0));
  // lente: barril leve e aberração cromática que cresce para as bordas
  uv = 0.5 + c * (1.0 - 0.025 * r2);
  float tick = floor(uTime * 24.0);
  float block = step(0.86, hash(vec2(floor(uv.y * 18.0), tick))) * uGlitch;
  vec2 off = c * (0.0012 + r2 * 0.0042) + vec2(0.012 * uGlitch + block * 0.02, 0.0);
  vec3 col;
  col.r = texture2D(uScene, uv + off).r;
  col.g = texture2D(uScene, uv).g;
  col.b = texture2D(uScene, uv - off).b;

  // vinheta, curva de contraste e grão
  col *= 1.0 - r2 * 0.5;
  col = col / (1.0 + col * 0.18);
  col = pow(col, vec3(0.96));
  col += (hash(vUv * uRes + fract(uTime * 7.3) * 91.0) - 0.5) * 0.04;
  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
  return s;
}

function program(gl: WebGLRenderingContext, frag: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, QUAD_VERT));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
  return p;
}

type V3 = [number, number, number];
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Enquadramento: o painel em 3/4 e a lente. Distâncias em "metros" de cena. */
export interface Framing {
  fovY: number;
  /** meia largura e meia altura do vidro */
  half: [number, number];
  center: V3;
  /** giro do painel em torno do eixo vertical (graus): positivo = recua para a direita */
  yaw: number;
  /** inclinação (graus): positivo = topo recua */
  pitch: number;
  /** ponto do vidro (uv) onde a lente foca */
  focusUv: [number, number];
  aperture: number;
  depth: number;
  active: [number, number, number, number];
}

type TexName = 'data' | 'title' | 'scratch';

export class TitleRenderer {
  private gl: WebGLRenderingContext;
  private scene: WebGLProgram;
  private post: WebGLProgram;
  private us: Record<string, WebGLUniformLocation | null> = {};
  private up: Record<string, WebGLUniformLocation | null> = {};
  private tex: Record<TexName, WebGLTexture>;
  private fbo: WebGLFramebuffer;
  private fboTex: WebGLTexture;
  private framing!: Framing;
  private basis = { u: [1, 0, 0] as V3, v: [0, 1, 0] as V3, n: [0, 0, 1] as V3 };
  private pointerN = { x: 0.62, y: 0.42, tx: 0.62, ty: 0.42 };
  private cam = { yaw: 0, pitch: 0 };
  private glitchUntil = 0;
  private glitchStrength = 0;
  private start = performance.now();
  reveal = 0;
  power = 0;
  promptOn = 1;
  /** 0 → 1: a câmera avança para dentro do vidro (transição para o hacking) */
  dolly = 0;
  autoLight = false;
  prompt: [number, number, number, number] = [0, 0, 0, 0];

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('webgl');
    this.gl = gl;
    this.scene = program(gl, SCENE_FRAG);
    this.post = program(gl, POST_FRAG);
    const sceneU = ['uData', 'uTitle', 'uScratch', 'uRes', 'uTime', 'uTan', 'uCamPos', 'uCam', 'uPC', 'uPU', 'uPV', 'uPN', 'uPH', 'uDepth', 'uActive', 'uFocus', 'uAperture', 'uLight', 'uReveal', 'uPower', 'uPrompt', 'uPromptOn', 'uGlitch', 'uPx'];
    for (const n of sceneU) this.us[n] = gl.getUniformLocation(this.scene, n);
    for (const n of ['uScene', 'uRes', 'uTime', 'uGlitch']) this.up[n] = gl.getUniformLocation(this.post, n);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const make = () => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      return t;
    };
    this.tex = { data: make(), title: make(), scratch: make() };
    this.fboTex = make();
    this.fbo = gl.createFramebuffer()!;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  /** Texturas em potência de 2: mipmaps funcionam até no WebGL1 (é deles que vem o desfoque de lente). */
  upload(which: TexName, source: HTMLCanvasElement) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex[which]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    const pot = (n: number) => (n & (n - 1)) === 0;
    if (pot(source.width) && pot(source.height)) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, which === 'title' ? 8 : 4);
    }
  }

  resize(width: number, height: number) {
    const gl = this.gl;
    this.canvas.width = Math.max(2, Math.round(width));
    this.canvas.height = Math.max(2, Math.round(height));
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.canvas.width, this.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  setFraming(f: Framing) {
    this.framing = f;
    const y = (f.yaw * Math.PI) / 180;
    const p = (f.pitch * Math.PI) / 180;
    // giro (yaw) e depois inclinação (pitch) do painel
    const u = norm([Math.cos(y), 0, -Math.sin(y)]);
    const v0: V3 = [0, 1, 0];
    const n0 = cross(u, v0);
    const v = norm([v0[0] * Math.cos(p) + n0[0] * -Math.sin(p), v0[1] * Math.cos(p) + n0[1] * -Math.sin(p), v0[2] * Math.cos(p) + n0[2] * -Math.sin(p)]);
    let n = norm(cross(u, v));
    if (dot(n, [-f.center[0], -f.center[1], -f.center[2]]) < 0) n = [-n[0], -n[1], -n[2]];
    this.basis = { u, v, n };
  }

  /** Ponto do vidro (mundo) a partir de coordenadas uv do painel. */
  panelPoint(uvx: number, uvy: number): V3 {
    const { center, half } = this.framing;
    const { u, v } = this.basis;
    const x = (uvx - 0.5) * 2 * half[0];
    const yv = (uvy - 0.5) * 2 * half[1];
    return [center[0] + u[0] * x + v[0] * yv, center[1] + u[1] * x + v[1] * yv, center[2] + u[2] * x + v[2] * yv];
  }

  /** Coordenadas normalizadas da tela, origem embaixo à esquerda. */
  pointer(x: number, y: number) {
    this.pointerN.tx = x;
    this.pointerN.ty = y;
    this.autoLight = false;
  }

  glitch(strength = 1, ms = 220) {
    this.glitchStrength = strength;
    this.glitchUntil = performance.now() + ms;
  }

  render(now: number) {
    const gl = this.gl;
    const f = this.framing;
    if (!f) return;
    const t = (now - this.start) / 1000;
    const P = this.pointerN;
    if (this.autoLight) {
      P.tx = 0.42 + Math.sin(t * 0.37) * 0.3;
      P.ty = 0.5 + Math.sin(t * 0.23 + 1.3) * 0.26;
    }
    P.x += (P.tx - P.x) * 0.07;
    P.y += (P.ty - P.y) * 0.07;

    // câmera: respiração lenta + paralaxe do mouse + avanço na transição
    const W = this.canvas.width;
    const H = this.canvas.height;
    const aspect = W / H;
    const tanY = Math.tan(((f.fovY * Math.PI) / 180) / 2);
    const tanX = tanY * aspect;
    const targetYaw = (P.x - 0.5) * -0.05 + Math.sin(t * 0.21) * 0.006;
    const targetPitch = (P.y - 0.5) * 0.03 + Math.sin(t * 0.17 + 0.6) * 0.004;
    this.cam.yaw += (targetYaw - this.cam.yaw) * 0.05;
    this.cam.pitch += (targetPitch - this.cam.pitch) * 0.05;
    const cy = Math.cos(this.cam.yaw);
    const sy = Math.sin(this.cam.yaw);
    const cp = Math.cos(this.cam.pitch);
    const sp = Math.sin(this.cam.pitch);
    const right: V3 = [cy, 0, -sy];
    const up: V3 = [sy * sp, cp, cy * sp];
    const back: V3 = [sy * cp, -sp, cy * cp];

    const focusP = this.panelPoint(f.focusUv[0], f.focusUv[1]);
    const d = this.dolly * this.dolly * (3 - 2 * this.dolly);
    const camPos: V3 = [focusP[0] * d * 0.82, focusP[1] * d * 0.82, focusP[2] * d * 0.82];
    const focusDist = Math.hypot(focusP[0] - camPos[0], focusP[1] - camPos[1], focusP[2] - camPos[2]);

    // luz: onde o raio do ponteiro toca o vidro, um pouco à frente dele
    const { u, v, n } = this.basis;
    const nx = P.x * 2 - 1;
    const ny = P.y * 2 - 1;
    const rd = norm([right[0] * nx * tanX + up[0] * ny * tanY - back[0], right[1] * nx * tanX + up[1] * ny * tanY - back[1], right[2] * nx * tanX + up[2] * ny * tanY - back[2]]);
    const denom = dot(rd, n);
    const tHit = denom < -1e-4 ? dot([f.center[0] - camPos[0], f.center[1] - camPos[1], f.center[2] - camPos[2]], n) / denom : 2;
    const hit: V3 = [camPos[0] + rd[0] * tHit, camPos[1] + rd[1] * tHit, camPos[2] + rd[2] * tHit];
    const light: V3 = [hit[0] + n[0] * 0.16, hit[1] + n[1] * 0.16, hit[2] + n[2] * 0.16];

    const glitch = now < this.glitchUntil ? this.glitchStrength : 0;

    // passo 1: cena no framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, W, H);
    gl.useProgram(this.scene);
    const U = this.us;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.data);
    gl.uniform1i(U.uData, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.title);
    gl.uniform1i(U.uTitle, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.scratch);
    gl.uniform1i(U.uScratch, 2);
    gl.uniform2f(U.uRes, W, H);
    gl.uniform1f(U.uTime, t);
    gl.uniform2f(U.uTan, tanX, tanY);
    gl.uniform3fv(U.uCamPos, camPos);
    gl.uniformMatrix3fv(U.uCam, false, [...right, ...up, ...back]);
    gl.uniform3fv(U.uPC, f.center);
    gl.uniform3fv(U.uPU, u);
    gl.uniform3fv(U.uPV, v);
    gl.uniform3fv(U.uPN, n);
    gl.uniform2f(U.uPH, f.half[0], f.half[1]);
    gl.uniform1f(U.uDepth, f.depth);
    gl.uniform4fv(U.uActive, f.active);
    gl.uniform1f(U.uFocus, focusDist);
    gl.uniform1f(U.uAperture, f.aperture * (1 + d * 3));
    gl.uniform3fv(U.uLight, light);
    gl.uniform1f(U.uReveal, this.reveal);
    gl.uniform1f(U.uPower, this.power);
    gl.uniform4fv(U.uPrompt, this.prompt);
    gl.uniform1f(U.uPromptOn, this.promptOn);
    gl.uniform1f(U.uGlitch, glitch);
    gl.uniform1f(U.uPx, (2 * tanY) / H);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // passo 2: lente
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(this.post);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.uniform1i(this.up.uScene, 0);
    gl.uniform2f(this.up.uRes, W, H);
    gl.uniform1f(this.up.uTime, t);
    gl.uniform1f(this.up.uGlitch, glitch);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose() {
    // o contexto é liberado junto com o canvas quando a abertura sai da página
    const gl = this.gl;
    Object.values(this.tex).forEach((t) => gl.deleteTexture(t));
    gl.deleteTexture(this.fboTex);
    gl.deleteFramebuffer(this.fbo);
    gl.deleteProgram(this.scene);
    gl.deleteProgram(this.post);
  }
}
