import * as THREE from 'three';
import type { GlassAsset } from './asset';

// Vidro grosso, no estilo das letras de vidro da referência: o raio entra pela face da frente,
// atravessa a espessura, sai pela de trás (as duas refratam) e lê o que está atrás, que é o próprio
// manifesto (uma réplica da página desenhada numa textura). Cada comprimento de onda tem seu índice
// de refração, então as bordas abrem em arco-íris. Por cima, o reflexo de um estúdio de tiras de luz.

const SHARED = /* glsl */ `
uniform sampler2D uFieldOut;
uniform sampler2D uFieldSlope;
uniform vec4 uFieldRect;   // minX, minY, maxX, maxY (modelo)
uniform float uWall;
uniform float uBevel;
uniform mat3 uNormalMatrix;
varying vec3 vObj;
varying vec3 vObjN;
varying vec3 vView;

// normal exata por pixel: parede e chanfro pela altura (perto da borda), face pela inclinação do campo
vec3 fieldNormal(vec3 p, vec3 fallback) {
  vec2 uv = vec2((p.x - uFieldRect.x) / (uFieldRect.z - uFieldRect.x), (uFieldRect.w - p.y) / (uFieldRect.w - uFieldRect.y));
  vec2 o = texture2D(uFieldOut, uv).xy * 2.0 - 1.0;
  float ol = length(o);
  vec2 outv = ol > 1e-3 ? o / ol : normalize(fallback.xy + vec2(1e-6));
  vec2 gc = texture2D(uFieldSlope, uv).xy * 2.0 - 1.0;
  float m = length(gc);
  vec2 g = m > 1e-4 ? gc * (1.0 / max(1.0 - m, 1e-3)) : vec2(0.0);
  float sz = p.z >= 0.0 ? 1.0 : -1.0;
  float sphi = clamp((abs(p.z) - uWall) / uBevel, 0.0, 1.0);
  vec3 nz = vec3(outv * sqrt(1.0 - sphi * sphi), sz * sphi);
  vec3 ns = normalize(vec3(g, sz));
  float t = smoothstep(0.26, 0.5, abs(ns.z));
  return normalize(mix(nz, ns, t));
}
`;

const VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vObjN;
varying vec3 vView;
void main() {
  vObj = position;
  vObjN = normal;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

// o verso guarda a normal e a distância da face de trás; sem render em float, codifica em 8 bits
const BACK_FRAG = /* glsl */ `
${SHARED}
uniform vec2 uDepthRange; // perto, extensão (só no modo de 8 bits)
void main() {
  vec3 n = normalize(uNormalMatrix * fieldNormal(vObj, normalize(vObjN)));
  #ifdef BACK_ENCODED
    gl_FragColor = vec4(n * 0.5 + 0.5, clamp((-vView.z - uDepthRange.x) / uDepthRange.y, 0.004, 1.0));
  #else
    gl_FragColor = vec4(n, -vView.z);
  #endif
}
`;

const GLASS_FRAG = /* glsl */ `
${SHARED}
uniform sampler2D uBack;
uniform sampler2D uBg;
uniform vec2 uRes;
uniform mat4 uProj;
uniform float uIor;
uniform float uDisp;
uniform float uBgZ;
uniform float uThick;
uniform float uAbsorb;
uniform float uReveal;
uniform vec2 uDepthRange;
uniform vec3 uLight;
uniform float uLightAmt;
uniform vec4 uCrop;        // o pedaço do palco que o canvas cobre: canto de baixo à esquerda e tamanho (uv)

vec4 backAt(vec2 uv) {
  vec4 b = texture2D(uBack, uv);
  #ifdef BACK_ENCODED
    return b.a > 0.0 ? vec4(b.rgb * 2.0 - 1.0, uDepthRange.x + b.a * uDepthRange.y) : vec4(0.0);
  #else
    // na borda da silhueta o filtro mistura o verso com o vazio (zero): o comprimento da normal é
    // a cobertura, e dividir por ele desfaz a mistura (sem isso a espessura sai errada nos contornos)
    float cov = length(b.xyz);
    return cov > 0.5 ? b / cov : vec4(0.0);
  #endif
}

float rectLight(vec3 d, vec3 c, vec3 up, vec2 hs, float soft) {
  float k = dot(d, c);
  if (k <= 0.0) return 0.0;
  vec3 r = normalize(cross(up, c));
  vec3 u = cross(c, r);
  vec2 q = vec2(dot(d, r), dot(d, u)) / k;
  vec2 e = hs - abs(q);
  return smoothstep(0.0, soft, e.x) * smoothstep(0.0, soft, e.y);
}

// estúdio fixo em relação à câmera (o calango gira, os reflexos deslizam): fundo quase preto,
// um softbox pequeno no alto à esquerda da câmera (um painel largo de frente velaria a peça de cinza
// sempre que ela encarasse a câmera), tiras verticais dos lados, uma faixa no alto e um contraluz verde
vec3 studio(vec3 d) {
  vec3 c = vec3(0.010, 0.011, 0.010) + vec3(0.025, 0.028, 0.026) * smoothstep(-0.3, 1.0, d.y);
  vec3 Y = vec3(0.0, 1.0, 0.0);
  c += vec3(1.6) * rectLight(d, normalize(vec3(-0.35, 0.45, 1.0)), Y, vec2(0.25, 0.12), 0.08);
  c += vec3(6.0) * rectLight(d, normalize(vec3(0.92, 0.10, 0.38)), Y, vec2(0.075, 1.40), 0.02);
  c += vec3(3.4) * rectLight(d, normalize(vec3(-0.95, 0.05, 0.30)), Y, vec2(0.055, 1.20), 0.02);
  c += vec3(4.2) * rectLight(d, normalize(vec3(0.62, 0.15, -0.78)), Y, vec2(0.10, 1.10), 0.02);
  c += vec3(2.6) * rectLight(d, normalize(vec3(-0.55, 0.20, -0.82)), Y, vec2(0.07, 0.90), 0.02);
  // dois painéis largos e suaves dos lados: as paredes acendem quando a peça vira
  c += vec3(0.9) * rectLight(d, normalize(vec3(1.0, 0.05, -0.15)), Y, vec2(0.45, 1.3), 0.25);
  c += vec3(0.6) * rectLight(d, normalize(vec3(-1.0, 0.05, -0.10)), Y, vec2(0.45, 1.3), 0.25);
  c += vec3(3.8) * rectLight(d, normalize(vec3(0.0, 0.94, 0.33)), vec3(0.0, 0.0, -1.0), vec2(1.10, 0.10), 0.02);
  c += vec3(0.32, 0.85, 0.20) * 1.4 * rectLight(d, normalize(vec3(0.0, -0.92, 0.38)), vec3(0.0, 0.0, -1.0), vec2(1.30, 0.16), 0.12);
  // com o cursor em cima, um softbox a mais acompanha o ponteiro: um brilho largo corre pela face
  // e acende as quinas por onde passa
  c += vec3(4.0) * uLightAmt * rectLight(d, uLight, Y, vec2(0.22, 0.22), 0.18);
  return c;
}

vec3 spectral(float t) {
  return vec3(
    exp(-pow((t - 0.06) / 0.25, 2.0)) + 0.32 * exp(-pow((t - 0.98) / 0.16, 2.0)),
    exp(-pow((t - 0.48) / 0.24, 2.0)),
    exp(-pow((t - 0.88) / 0.25, 2.0))
  );
}

vec2 screenUv(vec3 p) {
  vec4 c = uProj * vec4(p, 1.0);
  return c.xy / c.w * 0.5 + 0.5;
}

// a página atrás do vidro, onde o raio que sai a encontra. A leitura acontece sempre (fora de
// qualquer if): assim o mipmap mede o quanto a imagem encolhe ali e filtra no nível certo, e as
// bordas curvas mostram faixas lisas em vez de grão. w diz se o raio chegou mesmo à página.
// screenUv conta dentro do recorte do canvas; a página é o palco inteiro
vec3 pageAt(vec3 p, vec3 t, out float w) {
  vec2 uv = uCrop.xy + screenUv(p + t * ((uBgZ - p.z) / min(t.z, -1e-3))) * uCrop.zw;
  vec2 e = smoothstep(vec2(-0.02), vec2(0.03), uv) * smoothstep(vec2(-0.02), vec2(0.03), 1.0 - uv);
  w = e.x * e.y * step(t.z, -1e-3);
  return texture2D(uBg, clamp(uv, 0.0, 1.0)).rgb;
}

#define SAMPLES 8

void main() {
  vec3 N1 = normalize(uNormalMatrix * fieldNormal(vObj, normalize(vObjN)));
  vec3 P1 = vView;
  vec3 V = normalize(P1);
  vec4 b0 = backAt(gl_FragCoord.xy / uRes);
  float thick = b0.w > 0.0 ? max(b0.w + P1.z, 0.0) : uThick;

  vec3 acc = vec3(0.0);
  vec3 wsum = vec3(0.0);
  for (int i = 0; i < SAMPLES; i++) {
    float t = (float(i) + 0.5) / float(SAMPLES);
    float ior = uIor + (t - 0.5) * uDisp;
    vec3 T1 = refract(V, N1, 1.0 / ior);
    vec3 P2 = P1 + T1 * (thick / max(dot(T1, V), 0.3));
    vec4 b2 = backAt(screenUv(P2));
    vec3 N2 = b2.w > 0.0 ? normalize(b2.xyz) : -N1;
    vec3 T2 = refract(T1, -N2, ior);
    float onPage;
    vec3 page = pageAt(P2, T2, onPage);
    vec3 col;
    if (dot(T2, T2) < 1e-6) {
      // reflexão interna total: o raio fica preso e devolve um reflexo apagado do estúdio
      col = studio(reflect(T1, -N2)) * 0.45;
    } else {
      // fora da tela (ou voltando para a câmera), o raio vê o estúdio
      col = onPage > 0.999 ? page : mix(studio(T2), page, onPage);
    }
    vec3 w = spectral(t);
    acc += col * w;
    wsum += w;
  }
  vec3 refr = acc / wsum * exp(-thick * uAbsorb);

  float cosi = clamp(dot(-V, N1), 0.0, 1.0);
  float F = 0.05 + 0.95 * pow(1.0 - cosi, 5.0);
  vec3 refl = studio(reflect(V, N1));
  vec3 col = mix(refr, refl, F);
  gl_FragColor = vec4(col * uReveal, uReveal);
  #include <colorspace_fragment>
}
`;

export interface Placement {
  /** centro, em px CSS dentro do canvas */
  cx: number;
  cy: number;
  /** altura do logo em px CSS */
  height: number;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export class GlassRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  readonly pivot = new THREE.Group();
  readonly bgTexture: THREE.CanvasTexture;
  private front: THREE.Mesh;
  private back: THREE.Mesh;
  private backRT: THREE.WebGLRenderTarget;
  private floatBack: boolean;
  readonly uniforms: Record<string, THREE.IUniform>;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private at: Placement = { cx: 0, cy: 0, height: 1 };
  /** o pedaço do palco que o canvas cobre, em px CSS (alinhado aos pixels da tela) */
  readonly crop = { x: 0, y: 0, w: 1, h: 1 };
  private device = { w: 0, h: 0 };
  private _mv = new THREE.Matrix4();
  private _v = new THREE.Vector3();
  private _n = new THREE.Vector3();
  /** rotação atual (rad), para o overlay escrever os números */
  readonly rot = { x: 0, y: 0 };

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly asset: GlassAsset,
    bgCanvas: HTMLCanvasElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
    // os tamanhos chegam já em pixels da tela (o recorte é alinhado a eles)
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;
    this.camera.position.set(0, 0, 6);

    this.bgTexture = new THREE.CanvasTexture(bgCanvas);
    this.bgTexture.colorSpace = THREE.SRGBColorSpace;
    // com mipmaps: onde o vidro encolhe a página (bordas, sulcos), a leitura sai filtrada
    this.bgTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.bgTexture.generateMipmaps = true;

    const ext = this.renderer.extensions;
    this.floatBack = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    this.backRT = new THREE.WebGLRenderTarget(1, 1, {
      type: this.floatBack ? THREE.HalfFloatType : THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      // em 8 bits a mistura com o vazio não tem como ser desfeita: lê o texel exato
      minFilter: this.floatBack ? THREE.LinearFilter : THREE.NearestFilter,
      magFilter: this.floatBack ? THREE.LinearFilter : THREE.NearestFilter,
    });

    const f = asset.header.field;
    this.uniforms = {
      uFieldOut: { value: asset.fieldOut },
      uFieldSlope: { value: asset.fieldSlope },
      uFieldRect: { value: new THREE.Vector4(f.min[0], f.min[1], f.max[0], f.max[1]) },
      uWall: { value: f.wall },
      uBevel: { value: asset.header.bevel },
      uNormalMatrix: { value: new THREE.Matrix3() },
      uBack: { value: this.backRT.texture },
      uBg: { value: this.bgTexture },
      uRes: { value: new THREE.Vector2(1, 1) },
      uProj: { value: this.camera.projectionMatrix },
      uIor: { value: 1.52 },
      uDisp: { value: 0.1 },
      uBgZ: { value: -6.5 },
      uThick: { value: asset.header.halfDepth * 2 },
      uAbsorb: { value: 0.25 },
      uReveal: { value: 1 },
      uDepthRange: { value: new THREE.Vector2(5, 2) },
      uLight: { value: new THREE.Vector3(0, 0, 1) },
      uLightAmt: { value: 0 },
      uCrop: { value: new THREE.Vector4(0, 0, 1, 1) },
    };
    const defines = this.floatBack ? {} : { BACK_ENCODED: 1 };
    const backMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BACK_FRAG, uniforms: this.uniforms, defines, side: THREE.BackSide });
    const glassMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: GLASS_FRAG, uniforms: this.uniforms, defines, side: THREE.FrontSide, transparent: true, premultipliedAlpha: true });
    this.back = new THREE.Mesh(asset.geometry, backMat);
    this.front = new THREE.Mesh(asset.geometry, glassMat);
    this.back.frustumCulled = this.front.frustumCulled = false;
    this.pivot.add(this.back, this.front);
    this.scene.add(this.pivot);
  }

  /** Compila os dois shaders sem travar a página (compilação paralela, quando o navegador tem). */
  async compile() {
    const r = this.renderer;
    try {
      this.front.visible = false;
      this.back.visible = true;
      r.setRenderTarget(this.backRT);
      await r.compileAsync(this.scene, this.camera);
      this.back.visible = false;
      this.front.visible = true;
      r.setRenderTarget(null);
      await r.compileAsync(this.scene, this.camera);
    } catch {
      // sem compilação assíncrona: a primeira renderização compila
    } finally {
      r.setRenderTarget(null);
    }
  }

  resize(w: number, h: number, dpr: number) {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.dpr = dpr;
    this.camera.aspect = this.w / this.h;
    this.fit();
  }

  /** O lugar do calango (só muda quando a tela muda de tamanho: a peça não anda). */
  place(p: Placement) {
    this.at = { ...p };
    this.fit();
  }

  /**
   * O canvas cobre só a caixa onde a peça pode aparecer, em qualquer giro e inclinação, e não o palco
   * inteiro: o resto seria transparente, e limpar, suavizar (MSAA) e compor uma tela cheia de nada a
   * cada quadro pesa na GPU. A câmera continua a do palco inteiro; o canvas é uma janela dela.
   */
  private fit() {
    const { dpr } = this;
    const W = Math.max(1, Math.round(this.w * dpr));
    const H = Math.max(1, Math.round(this.h * dpr));
    const box = this.footprint();
    // a caixa em px CSS inteiros (com folga): o verso, que fica na resolução da página, cai na mesma
    // grade do palco inteiro; depois, em pixels da tela
    const pad = 6;
    const left = clamp(Math.floor(box.x0 - pad), 0, Math.ceil(this.w) - 1);
    const top = clamp(Math.floor(box.y0 - pad), 0, Math.ceil(this.h) - 1);
    const x0 = Math.round(left * dpr);
    const y0 = Math.round(top * dpr);
    const x1 = clamp(Math.round(Math.ceil(box.x1 + pad) * dpr), x0 + 1, W);
    const y1 = clamp(Math.round(Math.ceil(box.y1 + pad) * dpr), y0 + 1, H);
    const cw = x1 - x0;
    const ch = y1 - y0;
    this.camera.setViewOffset(W, H, x0, y0, cw, ch);
    this.camera.updateProjectionMatrix();
    if (cw !== this.device.w || ch !== this.device.h) {
      this.device = { w: cw, h: ch };
      this.renderer.setSize(cw, ch, false);
      (this.uniforms.uRes.value as THREE.Vector2).set(cw, ch);
      // o verso fica na resolução da página (px CSS), não na da tela: só guia a segunda refração
      this.backRT.setSize(Math.max(1, Math.round(cw / Math.max(1, dpr))), Math.max(1, Math.round(ch / Math.max(1, dpr))));
    }
    (this.uniforms.uCrop.value as THREE.Vector4).set(x0 / W, (H - y1) / H, cw / W, ch / H);
    Object.assign(this.crop, { x: x0 / dpr, y: y0 / dpr, w: cw / dpr, h: ch / dpr });
  }

  /** a caixa da peça na tela (px CSS do palco), somando os giros e as inclinações possíveis */
  private footprint() {
    this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    const geo = this.front.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const corners: THREE.Vector3[] = [];
    for (let i = 0; i < 8; i++) corners.push(new THREE.Vector3(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z));
    const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const v = this._v;
    // a inclinação vai a ±0,3 rad (o cursor em cima): um pouco de folga para a mola
    for (const tilt of [-0.36, 0, 0.36]) {
      for (let i = 0; i < 48; i++) {
        this.pose((i / 48) * Math.PI * 2, tilt);
        for (const c of corners) {
          v.copy(c).applyMatrix4(this.front.matrixWorld).project(this.camera);
          const x = (v.x * 0.5 + 0.5) * this.w;
          const y = (0.5 - v.y * 0.5) * this.h;
          box.x0 = Math.min(box.x0, x);
          box.x1 = Math.max(box.x1, x);
          box.y0 = Math.min(box.y0, y);
          box.y1 = Math.max(box.y1, y);
        }
      }
    }
    return box;
  }

  /** px CSS por unidade do mundo no plano z = 0 */
  private unitsPerPx() {
    return (2 * this.camera.position.z * Math.tan((this.camera.fov * Math.PI) / 360)) / this.h;
  }

  /**
   * angle: giro em torno do eixo vertical da própria peça; tilt: a inclinação para o cursor, aplicada
   * depois (em torno do eixo horizontal da tela), para o eixo do giro não rodar junto
   */
  private pose(angle: number, tilt: number) {
    const p = this.at;
    const u = this.unitsPerPx();
    this.pivot.position.set((p.cx - this.w / 2) * u, -(p.cy - this.h / 2) * u, 0);
    this.pivot.scale.setScalar(p.height * u);
    this.rot.y = angle;
    this.rot.x = tilt;
    // ordem XYZ: primeiro o giro (Y, da peça), depois a inclinação (X)
    this.pivot.rotation.set(tilt, angle, 0, 'XYZ');
    this.pivot.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();
    this._mv.multiplyMatrices(this.camera.matrixWorldInverse, this.front.matrixWorld);
    (this.uniforms.uNormalMatrix.value as THREE.Matrix3).getNormalMatrix(this._mv);
    // o plano do fundo fica um pouco atrás do calango (o quanto ele "descola" da página)
    const size = p.height * u;
    this.uniforms.uBgZ.value = -this.camera.position.z - size * 0.55;
    (this.uniforms.uDepthRange.value as THREE.Vector2).set(this.camera.position.z - size * 0.75, size * 1.5);
  }

  /** desenha a peça; light: ponteiro relativo ao centro (-1..1) e o quanto a luz dele está acesa */
  render(angle: number, tilt: number, light: { x: number; y: number; amount: number }, reveal = 1) {
    this.pose(angle, tilt);
    this.uniforms.uReveal.value = reveal;
    // a luz do ponteiro fica onde a face da frente a reflete na direção da câmera, deslocada para onde
    // o ponteiro está (y da tela para baixo, do mundo para cima): o brilho corre pelo vidro com o cursor
    const n = this._n.set(0, 0, 1).transformDirection(this._mv);
    const v = this._v.setFromMatrixPosition(this._mv).normalize();
    (this.uniforms.uLight.value as THREE.Vector3)
      .copy(v.reflect(n))
      .add(this._n.set(light.x * 0.4, -light.y * 0.4, 0))
      .normalize();
    this.uniforms.uLightAmt.value = light.amount;
    const r = this.renderer;
    this.front.visible = false;
    this.back.visible = true;
    r.setRenderTarget(this.backRT);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.scene, this.camera);
    this.back.visible = false;
    this.front.visible = true;
    r.setRenderTarget(null);
    r.clear();
    r.render(this.scene, this.camera);
  }

  /** Projeta pontos do modelo (x, y, z em altura = 1) para px CSS do palco. */
  project(points: ArrayLike<number>, out: Float32Array) {
    const v = this._v;
    const { crop } = this;
    for (let i = 0; i < points.length / 3; i++) {
      v.set(points[i * 3], points[i * 3 + 1], points[i * 3 + 2])
        .applyMatrix4(this.front.matrixWorld)
        .project(this.camera);
      // a câmera enxerga só o recorte do canvas: de volta ao palco inteiro
      out[i * 2] = crop.x + (v.x * 0.5 + 0.5) * crop.w;
      out[i * 2 + 1] = crop.y + (0.5 - v.y * 0.5) * crop.h;
    }
    return out;
  }

  dispose() {
    this.backRT.dispose();
    (this.back.material as THREE.Material).dispose();
    (this.front.material as THREE.Material).dispose();
    this.bgTexture.dispose();
    this.renderer.dispose();
  }
}
