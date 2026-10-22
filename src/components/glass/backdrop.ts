// Réplica da página atrás do vidro. O vidro só consegue entortar o que está numa textura, então o
// manifesto (frases na escada de resolução, tarjas, cabeçalho, trilho, flashes do acervo) é
// redesenhado num canvas 2D, nas mesmas posições da tela. Onde o vidro não está, quem aparece é a
// página de verdade; onde ele está, aparece esta réplica, refratada.
//
// Em duas camadas: o texto (letras, fios, tarjas) fica num canvas transparente, redesenhado só quando
// a página muda; a réplica é o fundo + o flash da vez + essa camada. Um flash que acende ou apaga só
// refaz a montagem, sem medir a página de novo. As fotos filtradas ficam prontas antes de piscar:
// assim que cada uma carrega, é decodificada e recortada fora da thread principal.

/** espera o navegador ficar ocioso (o Safari não tem requestIdleCallback: espera um pouco) */
const idle = () =>
  new Promise<void>((resolve) => {
    if (typeof (window as Partial<Window>).requestIdleCallback === 'function') window.requestIdleCallback(() => resolve(), { timeout: 500 });
    else window.setTimeout(resolve, 40);
  });

const FAMILY: Record<string, string> = {
  '0': 'Redaction',
  '20': 'Redaction 20',
  '35': 'Redaction 35',
  '50': 'Redaction 50',
  '70': 'Redaction 70',
  '100': 'Redaction 100',
};

interface LetterStyle {
  size: number;
  color: string;
  italic: boolean;
}

interface TextCache {
  /** posições das letras relativas à caixa do elemento pai */
  chars: { ch: string; x: number; y: number }[];
  font: string;
  color: string;
  w: number;
  h: number;
}

export class BackdropPainter {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  /** a camada do texto: letras, fios, tarjas e texto corrido, sobre transparente */
  private fg = document.createElement('canvas');
  private fx: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private scale = 1;
  private letters = new WeakMap<HTMLElement, LetterStyle>();
  private texts = new WeakMap<Text, TextCache>();
  /** as fotos do acervo já recortadas e filtradas para esta tela, prontas para desenhar */
  private flashes = new Map<HTMLImageElement, ImageBitmap>();
  private queue: HTMLImageElement[] = [];
  private draining = false;
  /** sobe a cada redimensionamento: o que estava sendo preparado para a tela antiga não serve */
  private generation = 0;
  private metrics = new Map<string, { a: number; d: number }>();
  private opacity = new Map<Element, number>();
  private onLoad = (e: Event) => this.enqueue(e.currentTarget as HTMLImageElement);

  constructor(private root: HTMLElement) {
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.fx = this.fg.getContext('2d')!;
    // as fotos carregam sob demanda (loading="lazy"): cada uma entra na fila quando chega
    this.flashImgs().forEach((img) => img.addEventListener('load', this.onLoad));
  }

  dispose() {
    this.flashImgs().forEach((img) => img.removeEventListener('load', this.onLoad));
    this.generation++;
    this.queue = [];
    this.flashes.forEach((b) => b.close());
    this.flashes.clear();
  }

  resize(w: number, h: number, scale: number) {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.scale = scale;
    this.canvas.width = this.fg.width = Math.round(this.w * scale);
    this.canvas.height = this.fg.height = Math.round(this.h * scale);
    this.letters = new WeakMap();
    this.texts = new WeakMap();
    this.flashes.forEach((b) => b.close());
    this.flashes.clear();
    this.generation++;
    this.queue = [];
    this.flashImgs().forEach((img) => this.enqueue(img));
  }

  private flashImgs() {
    return Array.from(this.root.querySelectorAll<HTMLImageElement>('.manifesto__flash img'));
  }

  private enqueue(img: HTMLImageElement) {
    if (!img.complete || !img.naturalWidth || this.flashes.has(img) || this.queue.includes(img)) return;
    this.queue.push(img);
    if (!this.draining) void this.drain();
  }

  /** prepara as fotos da fila, uma por vez, com o navegador ocioso */
  private async drain() {
    this.draining = true;
    while (this.queue.length) {
      await idle();
      const img = this.queue.shift();
      if (!img) continue;
      const generation = this.generation;
      try {
        const bmp = await this.flashBitmap(img);
        if (generation === this.generation && !this.flashes.has(img)) this.flashes.set(img, bmp);
        else bmp.close();
      } catch {
        // sem a versão pronta, essa foto só não aparece atrás do vidro
      }
    }
    this.draining = false;
  }

  /**
   * A foto como a página a mostra (object-fit: cover, no centro) e com o mesmo filtro do CSS, em meia
   * resolução: atrás do vidro, sobra. Decodificar e recortar acontece fora da thread principal
   * (createImageBitmap de um Blob, que vem do cache); o filtro é um desenho só, na GPU.
   */
  private async flashBitmap(img: HTMLImageElement) {
    const W = Math.max(1, Math.round((this.w * this.scale) / 2));
    const H = Math.max(1, Math.round((this.h * this.scale) / 2));
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const sw = Math.max(1, Math.round(W / s));
    const sh = Math.max(1, Math.round(H / s));
    const blob = await (await fetch(img.currentSrc || img.src)).blob();
    const cut = await createImageBitmap(blob, Math.round((img.naturalWidth - sw) / 2), Math.round((img.naturalHeight - sh) / 2), sw, sh, {
      resizeWidth: W,
      resizeHeight: H,
      resizeQuality: 'medium',
    });
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d')!;
    x.filter = getComputedStyle(img).filter;
    x.drawImage(cut, 0, 0, W, H);
    cut.close();
    return createImageBitmap(c);
  }

  private fontMetrics(font: string) {
    let m = this.metrics.get(font);
    if (!m) {
      this.fx.font = font;
      const t = this.fx.measureText('Hg');
      m = { a: t.fontBoundingBoxAscent, d: t.fontBoundingBoxDescent };
      this.metrics.set(font, m);
    }
    return m;
  }

  /** opacidade efetiva (o elemento e os pais até a raiz), uma leitura por pintura */
  private alphaOf(el: Element | null): number {
    if (!el || el === this.root) return 1;
    const hit = this.opacity.get(el);
    if (hit != null) return hit;
    const cs = getComputedStyle(el);
    const own = cs.display === 'none' || cs.visibility === 'hidden' ? 0 : parseFloat(cs.opacity);
    const v = own * (own > 0 ? this.alphaOf(el.parentElement) : 1);
    this.opacity.set(el, v);
    return v;
  }

  /** a página mudou: redesenha a camada do texto e monta a réplica */
  paint() {
    const { fx, root } = this;
    const box = root.getBoundingClientRect();
    this.opacity.clear();
    fx.setTransform(1, 0, 0, 1, 0, 0);
    fx.clearRect(0, 0, this.fg.width, this.fg.height);
    fx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    fx.globalAlpha = 1;
    this.paintBoxes(box);
    this.paintLetters(box);
    this.paintBars(box);
    this.paintText(box);
    fx.globalAlpha = 1;
    this.composite();
  }

  /** monta a réplica: o fundo, o flash da vez e a camada do texto (um flash que troca só refaz isto) */
  composite() {
    const { ctx } = this;
    const { width, height } = this.canvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#070807';
    ctx.fillRect(0, 0, width, height);
    this.root.querySelectorAll<HTMLImageElement>('.manifesto__flash img.is-on').forEach((img) => {
      const bmp = this.flashes.get(img);
      if (!bmp) {
        // ainda não ficou pronta (nunca na hora: fica para a próxima vez que ela piscar)
        this.enqueue(img);
        return;
      }
      const a = parseFloat(getComputedStyle(img).opacity);
      if (a < 0.01) return;
      ctx.globalAlpha = a;
      ctx.drawImage(bmp, 0, 0, width, height);
      ctx.globalAlpha = 1;
    });
    ctx.drawImage(this.fg, 0, 0);
  }

  /** fios e caixas: cabeçalho, selo, borda do texto do clube, trilho */
  private paintBoxes(box: DOMRect) {
    const ctx = this.fx;
    this.root.querySelectorAll<HTMLElement>('.manifesto__bar, .manifesto__bar-mid, .manifesto__about, .manifesto__rail span, .manifesto__rail i').forEach((el) => {
      const a = this.alphaOf(el);
      if (a < 0.01) return;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      const cs = getComputedStyle(el);
      const x = r.left - box.left;
      const y = r.top - box.top;
      ctx.globalAlpha = a;
      if (cs.backgroundColor && !/rgba\(.*,\s*0\)$|transparent/.test(cs.backgroundColor)) {
        ctx.fillStyle = cs.backgroundColor;
        ctx.fillRect(x, y, r.width, r.height);
      }
      const side = (w: string, style: string, color: string, fx: number, fy: number, fw: number, fh: number) => {
        const n = parseFloat(w);
        if (!n || style === 'none') return;
        ctx.fillStyle = color;
        ctx.fillRect(fx, fy, fw === 0 ? n : fw, fh === 0 ? n : fh);
      };
      side(cs.borderTopWidth, cs.borderTopStyle, cs.borderTopColor, x, y, r.width, 0);
      side(cs.borderBottomWidth, cs.borderBottomStyle, cs.borderBottomColor, x, y + r.height - parseFloat(cs.borderBottomWidth), r.width, 0);
      side(cs.borderLeftWidth, cs.borderLeftStyle, cs.borderLeftColor, x, y, 0, r.height);
      side(cs.borderRightWidth, cs.borderRightStyle, cs.borderRightColor, x + r.width - parseFloat(cs.borderRightWidth), y, 0, r.height);
    });
    ctx.globalAlpha = 1;
  }

  /** as letras do <Resolve />, cada uma no degrau em que está */
  private paintLetters(box: DOMRect) {
    const ctx = this.fx;
    this.root.querySelectorAll<HTMLElement>('.rz-c').forEach((s) => {
      const l = s.dataset.l;
      if (!l || l === 'off') return;
      const a = this.alphaOf(s.parentElement);
      if (a < 0.01) return;
      let st = this.letters.get(s);
      if (!st) {
        const cs = getComputedStyle(s);
        st = { size: parseFloat(cs.fontSize), color: cs.color, italic: !!s.closest('.rz-no') };
        this.letters.set(s, st);
      }
      const font = `${st.italic ? 'italic ' : ''}400 ${st.size}px "${FAMILY[l] ?? 'Redaction'}"`;
      const m = this.fontMetrics(font);
      const r = s.getBoundingClientRect();
      ctx.font = font;
      ctx.fillStyle = st.color;
      ctx.globalAlpha = a;
      const ch = s.textContent ?? '';
      const tw = ctx.measureText(ch).width;
      ctx.fillText(ch, r.left - box.left + (r.width - tw) / 2, r.top - box.top + (r.height - (m.a + m.d)) / 2 + m.a);
    });
    ctx.globalAlpha = 1;
  }

  /** as tarjas das frases que passaram (o ::after de cada palavra, no ponto em que a animação está) */
  private paintBars(box: DOMRect) {
    const ctx = this.fx;
    this.root.querySelectorAll<HTMLElement>('.mf-struck.is-redacted .mf-struck__t > span[aria-hidden] > .rz-word').forEach((w) => {
      const a = this.alphaOf(w);
      if (a < 0.01) return;
      const after = getComputedStyle(w, '::after');
      const m = after.transform.match(/matrix\(([^,]+),/);
      const sx = after.transform === 'none' ? 1 : m ? parseFloat(m[1]) : 1;
      if (sx <= 0.001) return;
      const em = parseFloat(getComputedStyle(w).fontSize);
      const r = w.getBoundingClientRect();
      const x = r.left - box.left - 0.07 * em;
      const y = r.top - box.top - 0.2 * em;
      ctx.globalAlpha = a;
      ctx.fillStyle = after.backgroundColor;
      ctx.fillRect(x, y, (r.width + 0.14 * em) * sx, r.height + 0.28 * em);
    });
    ctx.globalAlpha = 1;
  }

  /** texto corrido (cabeçalho, selo, texto do clube), letra a letra, nas posições reais */
  private paintText(box: DOMRect) {
    const ctx = this.fx;
    const walker = document.createTreeWalker(this.root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const p = n.parentElement;
        if (!p || !n.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
        if (p.closest('.rz-c, .sr-only, canvas, .manifesto__flash')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const range = document.createRange();
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      const p = n.parentElement!;
      const a = this.alphaOf(p);
      if (a < 0.01) continue;
      const pr = p.getBoundingClientRect();
      let c = this.texts.get(n);
      if (!c || c.w !== pr.width || c.h !== pr.height) {
        const cs = getComputedStyle(p);
        const upper = cs.textTransform === 'uppercase';
        const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const m = this.fontMetrics(font);
        const chars: TextCache['chars'] = [];
        const text = n.nodeValue!;
        for (let i = 0; i < text.length; i++) {
          if (/\s/.test(text[i])) continue;
          range.setStart(n, i);
          range.setEnd(n, i + 1);
          const rr = range.getClientRects()[0];
          if (!rr) continue;
          chars.push({ ch: upper ? text[i].toLocaleUpperCase('pt-BR') : text[i], x: rr.left - pr.left, y: rr.top - pr.top + m.a });
        }
        c = { chars, font, color: cs.color, w: pr.width, h: pr.height };
        this.texts.set(n, c);
      }
      ctx.font = c.font;
      ctx.fillStyle = c.color;
      ctx.globalAlpha = a;
      const ox = pr.left - box.left;
      const oy = pr.top - box.top;
      for (const ch of c.chars) ctx.fillText(ch.ch, ox + ch.x, oy + ch.y);
    }
    range.detach();
    ctx.globalAlpha = 1;
  }
}
