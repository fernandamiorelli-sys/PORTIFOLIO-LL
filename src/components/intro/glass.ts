// Renderizador WebGL da title screen: dados atrás de um vidro arranhado, com o título impresso no vidro.
// WebGL puro (sem three.js) para a primeira tela abrir rápido.

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uData;
uniform sampler2D uScratch;
uniform sampler2D uTitle;
uniform vec2 uRes;
uniform vec2 uLight;
uniform float uTime;
uniform float uGlitch;
uniform float uReveal;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;

  // glitch em fatias horizontais
  float slice = floor(uv.y * 28.0);
  float tick = floor(uTime * 20.0);
  float g = uGlitch * step(0.62, hash(vec2(slice, tick)));
  uv.x += g * (hash(vec2(slice + 3.1, tick)) - 0.5) * 0.09;

  vec4 scr = texture2D(uScratch, uv);

  // refração do vidro: barril leve + manchas deslocando a imagem de trás
  vec2 c = uv - 0.5;
  float r2 = dot(c * vec2(aspect, 1.0), c * vec2(aspect, 1.0));
  vec2 ruv = 0.5 + c * (1.0 - 0.035 * r2);
  ruv += (scr.g - 0.25) * 0.004;
  float ca = 0.0012 + r2 * 0.0045 + g * 0.012;
  vec3 back;
  back.r = texture2D(uData, ruv + vec2(ca, 0.0)).r;
  back.g = texture2D(uData, ruv).g;
  back.b = texture2D(uData, ruv - vec2(ca, 0.0)).b;
  // o vidro escurece e esverdeia levemente o que está atrás
  vec3 col = back * vec3(0.78, 0.86, 0.8);

  // luz que segue o mouse: os riscos só aparecem quando pegam luz
  vec2 d = (uv - uLight) * vec2(aspect, 1.0);
  float dist2 = dot(d, d);
  float spot = exp(-dist2 * 2.6);
  float hot = exp(-dist2 * 36.0);
  float scratch = scr.r;
  col += vec3(0.86, 0.93, 0.88) * scratch * (0.05 + 1.15 * spot);
  col += vec3(0.62, 0.72, 0.66) * scr.g * (0.03 + 0.16 * spot);
  col += vec3(0.9) * scr.b * (0.04 + 0.5 * spot);
  col += vec3(0.85, 0.95, 0.9) * hot * 0.07;

  // faixa de reflexo diagonal do vidro
  float diag = uv.x * 0.8 + uv.y * 0.55;
  float band = smoothstep(0.06, 0.0, abs(diag - 0.86 - sin(uTime * 0.13) * 0.04));
  float band2 = smoothstep(0.015, 0.0, abs(diag - 0.97 - sin(uTime * 0.13) * 0.04));
  col += vec3(0.8, 0.9, 0.85) * (band * 0.035 + band2 * 0.05);

  // título impresso no vidro, gasto pelos riscos
  vec2 tuv = uv + vec2(g * 0.012, 0.0);
  vec4 t = texture2D(uTitle, tuv);
  float worn = clamp(1.0 - scratch * 0.75 - scr.b * 0.5, 0.0, 1.0);
  float ta = clamp(t.a * worn * uReveal, 0.0, 1.0);
  // aberração cromática no título durante o glitch
  float tr = texture2D(uTitle, tuv + vec2(0.006 * g, 0.0)).a;
  float tb = texture2D(uTitle, tuv - vec2(0.006 * g, 0.0)).a;
  vec3 tcol = t.rgb;
  tcol.r = mix(tcol.r, 1.0, (tr - t.a) * g);
  tcol.b = mix(tcol.b, 1.0, (tb - t.a) * g);
  col = mix(col, tcol, ta);
  col += ta * spot * 0.07;

  // vinheta, scanlines e grão
  col *= 1.0 - r2 * 0.55;
  col *= 0.965 + 0.035 * sin(uv.y * uRes.y * 1.2);
  col += (hash(uv * uRes + fract(uTime) * 91.0) - 0.5) * 0.045;

  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
  return s;
}

export class GlassRenderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private textures: Record<'data' | 'scratch' | 'title', WebGLTexture>;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private light = { x: 0.62, y: 0.58, tx: 0.62, ty: 0.58 };
  private glitchUntil = 0;
  private glitchStrength = 0;
  private start = performance.now();
  reveal = 0;
  autoLight = false;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('webgl');
    this.gl = gl;
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    this.program = p;
    gl.useProgram(p);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    for (const name of ['uData', 'uScratch', 'uTitle', 'uRes', 'uLight', 'uTime', 'uGlitch', 'uReveal']) {
      this.u[name] = gl.getUniformLocation(p, name);
    }
    const make = (unit: number, uniform: string) => {
      const t = gl.createTexture()!;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      gl.uniform1i(this.u[uniform], unit);
      return t;
    };
    this.textures = { data: make(0, 'uData'), scratch: make(1, 'uScratch'), title: make(2, 'uTitle') };
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  }

  upload(which: 'data' | 'scratch' | 'title', source: HTMLCanvasElement) {
    const gl = this.gl;
    const unit = which === 'data' ? 0 : which === 'scratch' ? 1 : 2;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[which]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  resize(width: number, height: number) {
    this.canvas.width = Math.round(width);
    this.canvas.height = Math.round(height);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Coordenadas normalizadas, origem embaixo à esquerda. */
  pointer(x: number, y: number) {
    this.light.tx = x;
    this.light.ty = y;
    this.autoLight = false;
  }

  glitch(strength = 1, ms = 220) {
    this.glitchStrength = strength;
    this.glitchUntil = performance.now() + ms;
  }

  render(now: number) {
    const gl = this.gl;
    const t = (now - this.start) / 1000;
    if (this.autoLight) {
      this.light.tx = 0.5 + Math.sin(t * 0.37) * 0.32;
      this.light.ty = 0.5 + Math.sin(t * 0.23 + 1.3) * 0.28;
    }
    this.light.x += (this.light.tx - this.light.x) * 0.08;
    this.light.y += (this.light.ty - this.light.y) * 0.08;
    const glitch = now < this.glitchUntil ? this.glitchStrength : 0;

    gl.uniform2f(this.u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.u.uLight, this.light.x, this.light.y);
    gl.uniform1f(this.u.uTime, t);
    gl.uniform1f(this.u.uGlitch, glitch);
    gl.uniform1f(this.u.uReveal, this.reveal);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose() {
    // o contexto é liberado junto com o canvas quando a abertura sai da página
    const gl = this.gl;
    Object.values(this.textures).forEach((t) => gl.deleteTexture(t));
    gl.deleteProgram(this.program);
  }
}
