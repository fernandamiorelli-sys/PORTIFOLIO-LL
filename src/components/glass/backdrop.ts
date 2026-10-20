// Réplica da página atrás do vidro. O vidro só consegue entortar o que está numa textura, então o
// manifesto (frases na escada de resolução, tarjas, cabeçalho, trilho, flashes do acervo) é
// redesenhado num canvas 2D, nas mesmas posições da tela. Onde o vidro não está, quem aparece é a
// página de verdade; onde ele está, aparece esta réplica, refratada.

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
  private w = 1;
  private h = 1;
  private scale = 1;
  private letters = new WeakMap<HTMLElement, LetterStyle>();
  private texts = new WeakMap<Text, TextCache>();
  private flashes = new WeakMap<HTMLImageElement, HTMLCanvasElement>();
  private metrics = new Map<string, { a: number; d: number }>();
  private opacity = new Map<Element, number>();

  constructor(private root: HTMLElement) {
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
  }

  resize(w: number, h: number, scale: number) {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.scale = scale;
    this.canvas.width = Math.round(this.w * scale);
    this.canvas.height = Math.round(this.h * scale);
    this.letters = new WeakMap();
    this.texts = new WeakMap();
    this.flashes = new WeakMap();
  }

  private fontMetrics(font: string) {
    let m = this.metrics.get(font);
    if (!m) {
      this.ctx.font = font;
      const t = this.ctx.measureText('Hg');
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

  paint() {
    const { ctx, root } = this;
    const box = root.getBoundingClientRect();
    this.opacity.clear();
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#070807';
    ctx.fillRect(0, 0, this.w, this.h);
    this.paintFlashes();
    this.paintBoxes(box);
    this.paintLetters(box);
    this.paintBars(box);
    this.paintText(box);
    ctx.globalAlpha = 1;
  }

  private paintFlashes() {
    const imgs = this.root.querySelectorAll<HTMLImageElement>('.manifesto__flash img.is-on');
    imgs.forEach((img) => {
      const a = parseFloat(getComputedStyle(img).opacity);
      const bmp = this.flashBitmap(img);
      if (!bmp || a < 0.01) return;
      this.ctx.globalAlpha = a;
      this.ctx.drawImage(bmp, 0, 0, this.w, this.h);
    });
    this.ctx.globalAlpha = 1;
  }

  /** o flash já filtrado (o mesmo filtro do CSS), em meia resolução: atrás do vidro, sobra */
  private flashBitmap(img: HTMLImageElement) {
    let c = this.flashes.get(img);
    if (c) return c;
    if (!img.complete || !img.naturalWidth) return null;
    c = document.createElement('canvas');
    c.width = Math.max(1, Math.round((this.w * this.scale) / 2));
    c.height = Math.max(1, Math.round((this.h * this.scale) / 2));
    const x = c.getContext('2d')!;
    x.filter = getComputedStyle(img).filter;
    const s = Math.max(c.width / img.naturalWidth, c.height / img.naturalHeight);
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    x.drawImage(img, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
    this.flashes.set(img, c);
    return c;
  }

  /** fios e caixas: cabeçalho, selo, borda do texto do clube, trilho */
  private paintBoxes(box: DOMRect) {
    const { ctx } = this;
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
    const { ctx } = this;
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
    const { ctx } = this;
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
    const { ctx } = this;
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
