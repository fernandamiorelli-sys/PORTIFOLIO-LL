import fieldSource from './shaders/field.bundle.glsl?raw';
import linesSource from './shaders/lines.bundle.glsl?raw';

// Os shaders seguem o contrato do Shadertoy (mainImage, iResolution, iTime, iFrame, iChannel0): aqui eles
// ganham o cabeçalho do WebGL2 e um main que chama o mainImage. Um triângulo cobre a tela, sem buffers.
const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const fragment = (body: string, debug: number, gain: number) => `#version 300 es
precision highp float;
precision highp int;
${debug ? `#define DEBUG_MODE ${debug}\n` : ''}${gain !== 1 ? `#define TOPO_GAIN ${gain.toFixed(3)}\n` : ''}uniform vec3 iResolution;
uniform float iTime;
uniform int iFrame;
uniform vec4 iMouse;
uniform sampler2D iChannel0;
out vec4 topoColor;
${body}
void main() { mainImage(topoColor, gl_FragCoord.xy); }
`;

/** Lado do campo, em px de CSS: o relevo é suave e um texel a cada 4 px basta para a interpolação. */
const FIELD_TEXEL = 4;

interface Pass {
  program: WebGLProgram;
  shaders: WebGLShader[];
  resolution: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  frame: WebGLUniformLocation | null;
  mouse: WebGLUniformLocation | null;
  channel: WebGLUniformLocation | null;
}

/** A lanterna: onde está o cursor (px do canvas, de baixo para cima) e o quanto a luz está acesa. */
export interface Lamp {
  x: number;
  y: number;
  amount: number;
}

/** Desenha o fundo topográfico em duas passadas: o relevo numa textura pequena, as linhas na tela. */
export class TopoRenderer {
  readonly gl: WebGL2RenderingContext;
  private parallel: { COMPLETION_STATUS_KHR: number } | null;
  private field: Pass | null = null;
  private lines: Pass | null = null;
  private texture: WebGLTexture | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  private fieldW = 0;
  private fieldH = 0;
  private cssW = 0;
  private cssH = 0;
  private linked = false;
  ready = false;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('topo: sem WebGL2');
    this.gl = gl;
    this.parallel = gl.getExtension('KHR_parallel_shader_compile');
  }

  /** Começa a compilar. Com KHR_parallel_shader_compile, o navegador compila fora da thread principal.
   *  gain: força das linhas (1 no computador; mais no celular) */
  compile(debug = 0, gain = 1) {
    this.release();
    this.field = this.build(fragment(fieldSource, debug, gain));
    this.lines = this.build(fragment(linesSource, debug, gain));
    this.linked = false;
  }

  /** Confere a compilação sem esperar por ela; true quando os dois programas estão prontos. */
  poll() {
    if (this.ready) return true;
    const { gl, field, lines } = this;
    if (!field || !lines) return false;
    if (this.parallel) {
      const done = (p: Pass) => gl.getProgramParameter(p.program, this.parallel!.COMPLETION_STATUS_KHR) as boolean;
      if (!done(field) || !done(lines)) return false;
    }
    if (!this.linked) {
      for (const p of [field, lines]) {
        if (!gl.getProgramParameter(p.program, gl.LINK_STATUS)) {
          const logs = [gl.getProgramInfoLog(p.program), ...p.shaders.map((s) => gl.getShaderInfoLog(s))].filter(Boolean).join('\n');
          throw new Error(`topo: shader não compilou\n${logs}`);
        }
        p.resolution = gl.getUniformLocation(p.program, 'iResolution');
        p.time = gl.getUniformLocation(p.program, 'iTime');
        p.frame = gl.getUniformLocation(p.program, 'iFrame');
        p.mouse = gl.getUniformLocation(p.program, 'iMouse');
        p.channel = gl.getUniformLocation(p.program, 'iChannel0');
      }
      this.linked = true;
    }
    this.ready = this.linked && !!this.texture;
    return this.ready;
  }

  /** Tamanho em px de CSS e quantos pixels de tela por px de CSS (a densidade efetiva). */
  resize(cssW: number, cssH: number, scale: number) {
    const { gl, canvas } = this;
    const w = Math.max(1, Math.round(cssW * scale));
    const h = Math.max(1, Math.round(cssH * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (cssW === this.cssW && cssH === this.cssH && this.texture) return;
    this.cssW = cssW;
    this.cssH = cssH;
    this.fieldW = Math.max(2, Math.ceil(cssW / FIELD_TEXEL));
    this.fieldH = Math.max(2, Math.ceil(cssH / FIELD_TEXEL));
    if (this.texture) gl.deleteTexture(this.texture);
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, this.fieldW, this.fieldH);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (!this.framebuffer) this.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  draw(time: number, frame: number, lamp?: Lamp) {
    const { gl, field, lines } = this;
    if (!this.ready || !field || !lines) return;
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, this.fieldW, this.fieldH);
    gl.useProgram(field.program);
    gl.uniform3f(field.resolution, this.fieldW, this.fieldH, 1);
    gl.uniform1f(field.time, time);
    gl.uniform1i(field.frame, frame);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(lines.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(lines.channel, 0);
    gl.uniform3f(lines.resolution, this.canvas.width, this.canvas.height, 1);
    gl.uniform1f(lines.time, time);
    gl.uniform1i(lines.frame, frame);
    gl.uniform4f(lines.mouse, lamp?.x ?? 0, lamp?.y ?? 0, lamp?.amount ?? 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * Um desenho de um pixel, fora da vista, logo depois de ligar os programas: muitos drivers só terminam
   * de preparar um programa no primeiro desenho, e esse trabalho cai aqui, não no primeiro quadro de
   * verdade (que seria no meio da rolagem, na saída do manifesto).
   */
  warm() {
    const { gl, field, lines } = this;
    if (!this.ready || !field || !lines) return;
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, 1, 1);
    gl.useProgram(field.program);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(lines.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(lines.channel, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.flush();
  }

  /** Solta os recursos; o contexto fica com o canvas (perder o contexto à força quebraria uma remontagem). */
  dispose() {
    this.release();
    const { gl } = this;
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.framebuffer) gl.deleteFramebuffer(this.framebuffer);
    this.texture = this.framebuffer = null;
    this.cssW = this.cssH = 0;
  }

  /** Depois de perder o contexto (a GPU reiniciou), tudo precisa ser criado de novo. */
  reset() {
    this.field = this.lines = null;
    this.texture = this.framebuffer = null;
    this.cssW = this.cssH = 0;
    this.linked = this.ready = false;
  }

  private build(source: string): Pass {
    const { gl } = this;
    const program = gl.createProgram()!;
    const shaders = [
      [gl.VERTEX_SHADER, VERTEX],
      [gl.FRAGMENT_SHADER, source],
    ].map(([type, src]) => {
      const s = gl.createShader(type as number)!;
      gl.shaderSource(s, src as string);
      gl.compileShader(s);
      gl.attachShader(program, s);
      return s;
    });
    gl.linkProgram(program);
    return { program, shaders, resolution: null, time: null, frame: null, mouse: null, channel: null };
  }

  private release() {
    const { gl } = this;
    for (const p of [this.field, this.lines]) {
      if (!p) continue;
      p.shaders.forEach((s) => gl.deleteShader(s));
      gl.deleteProgram(p.program);
    }
    this.field = this.lines = null;
    this.linked = this.ready = false;
  }
}
