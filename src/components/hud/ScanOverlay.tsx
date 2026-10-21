import { useEffect, useRef } from 'react';
import { arrowCurve, box, INK_DIM, label, marker, prepare, rng } from '../../lib/dataOverlay';
import { getLenis, gsap, ScrollTrigger } from '../../lib/scroll';
import { experience, reducedMotion } from '../../lib/store';
import './scan.css';

// Data overlay pela página: quando o visitante para de rolar sobre um trecho novo, a página é "lida".
// Duas a cinco coisas na tela (fotos, pôsteres, títulos, o painel, o contrato) ganham caixa de
// rastreamento, nome, coordenadas, pontos rastreados e setas tracejadas de uma à outra. A leitura
// fica na tela, presa aos elementos, até o visitante rolar para baixo; aí se solta e some (rolando
// para cima, ela vai junto com os elementos e só some quando todos saem da tela).
// O manifesto tem a própria leitura (sobre o calango de vidro): ali, com a ficha ou o índice abertos,
// ou com movimento reduzido, nada acontece.

const TARGETS: [string, string][] = [
  ['.hero__frame', 'RETRATO'],
  ['.hero__name', 'NOME'],
  ['.hero__ascii', 'CÓDIGO'],
  ['.card__media', 'PEÇA'],
  ['.bid-entry__poster', 'PÔSTER'],
  ['.confrontos__poster', 'PÔSTER'],
  ['.screening__player', 'FILME'],
  ['.day__clock', 'RELÓGIO'],
  ['.vitrine', 'CAMISA'],
  ['.led', 'PAINEL'],
  ['.about__portrait', 'RETRATO'],
  ['.contract', 'CONTRATO'],
  ['.contract__sig', 'ASSINATURA'],
  ['.closing__cta', 'CHAMADA'],
  ['.room-intro__kicker', 'LEGENDA'],
  ['.room-intro__data', 'DADOS'],
  ['.bid-entry__record', 'REGISTRO'],
  ['.bid-entry__stamp', 'CARIMBO'],
  ['.about__facts', 'FICHA'],
  ['main img', 'IMAGEM'],
  ['main h2', 'TÍTULO'],
  ['main h3', 'TÍTULO'],
];
/** fotos e pôsteres ganham pontos rastreados por dentro */
const PICTURE = new Set(['RETRATO', 'PEÇA', 'PÔSTER', 'FILME', 'CAMISA', 'IMAGEM']);

/** parado por este tempo (s) num trecho novo (pelo menos 35% de tela adiante ou atrás da última leitura) */
const SETTLE = 0.45;
const NEW_CONTENT = 0.35;
/** a leitura se solta quando o visitante rola para baixo (roda, dedo, teclado); pela barra de rolagem,
 *  que não avisa, quando a página desce mais que isto (px). Ajustes da própria página (uma imagem
 *  que carrega acima e empurra a rolagem) não contam */
const RELEASE_BAR = 160;
const DOWN_KEYS = new Set(['ArrowDown', 'PageDown', 'End']);
const UP_KEYS = new Set(['ArrowUp', 'PageUp', 'Home']);
const LOCK = 0.5;
const FADE = 0.32;

interface Target {
  el: HTMLElement;
  /** a parte do elemento que estava à vista: deslocamento a partir do canto dele e tamanho */
  ox: number;
  oy: number;
  w: number;
  h: number;
  /** onde ela está na tela agora (medido de novo só quando a página rola) */
  vx: number;
  vy: number;
  kind: string;
  name: string;
  /** pontos rastreados dentro da caixa (frações) */
  points: [number, number][];
}

interface Reading {
  t0: number;
  /** o momento em que começou a sumir (rolagem para baixo) */
  out: number | null;
  targets: Target[];
  seed: number;
  n: number;
  /** a rolagem mais alta desde a leitura: descer daqui solta */
  anchor: number;
  /** a largura da janela quando a leitura começou */
  vw: number;
}

const pad = (n: number, k = 4) => String(Math.max(0, Math.round(n))).padStart(k, '0');
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** o nome do que está sendo lido: o texto alternativo, o título da peça ou o próprio texto (como
 *  aparece na tela: innerText separa as linhas e os itens de uma lista) */
function nameOf(el: HTMLElement) {
  const raw =
    (el instanceof HTMLImageElement ? el.alt : '') ||
    el.querySelector('img')?.alt ||
    el.closest('.card')?.querySelector<HTMLElement>('.card__title')?.innerText ||
    el.querySelector('.sr-only')?.textContent ||
    el.querySelector<HTMLElement>('h2, h3, [class*="__title"]')?.innerText ||
    el.getAttribute('aria-label') ||
    el.innerText ||
    '';
  const t = raw.replace(/\s+/g, ' ').trim().toLocaleUpperCase('pt-BR');
  return t.length > 30 ? `${t.slice(0, 29)}…` : t;
}

export function ScanOverlay() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (reducedMotion) return;
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const rand = rng((Math.random() * 2 ** 31) >>> 0);
    let reading: Reading | null = null;
    let count = 0;
    let still = 0;
    let scrolled = false;
    let lastAt: number | null = null;
    let dpr = 1;
    let lastDraw = -1;
    let lastData = -1;
    let measuredAt = -1;
    /** o último pedido do visitante foi para descer (roda, dedo ou tecla) */
    let wantsDown = false;
    /** logo depois de a janela mudar de tamanho (ou de a página se medir de novo), a rolagem salta
     *  sozinha: por estes quadros, sem pedido para descer, o salto não solta a leitura (em quadros, e
     *  não em tempo, para valer também num aparelho que engasga) */
    let settleFrames = 0;
    let data: { jx: number; jy: number; conf: string }[] = [];

    const scrollY = () => getLenis()?.animatedScroll ?? window.scrollY;

    // onde o manifesto está no documento (medido no refresh, não a cada quadro)
    const zone = { top: 0, bottom: 0 };
    const measureZone = () => {
      const m = document.getElementById('manifesto');
      if (!m) return;
      const r = m.getBoundingClientRect();
      zone.top = r.top + window.scrollY;
      zone.bottom = zone.top + r.height;
    };
    measureZone();
    const onRefresh = () => {
      measureZone();
      settleFrames = Math.max(settleFrames, 12);
      measuredAt = -1;
    };
    ScrollTrigger.addEventListener('refresh', onRefresh);

    const allowed = (y: number) => {
      const s = experience.get();
      const lenis = getLenis();
      if (s.phase !== 'site' || s.sheet || !lenis || lenis.isStopped) return false;
      return zone.top - y > innerHeight * 0.8 || zone.bottom - y < innerHeight * 0.2;
    };

    /** o que está à vista na faixa útil da tela, do maior para o menor, sem caixa dentro de caixa */
    const pick = (): Target[] => {
      const vw = innerWidth;
      const vh = innerHeight;
      const top = vh * 0.12;
      const bottom = vh * 0.88;
      const found: (Target & { area: number })[] = [];
      for (const [sel, kind] of TARGETS) {
        document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
          if (el.closest('#manifesto, .hud, .sheet')) return;
          if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return;
          const r = el.getBoundingClientRect();
          const x0 = Math.max(r.left, 20);
          const x1 = Math.min(r.right, vw - 20);
          const y0 = Math.max(r.top, top);
          const y1 = Math.min(r.bottom, bottom);
          // um bom pedaço à vista (a caixa pega só o que aparece, entre as barras do HUD)
          if (x1 - x0 < 70 || y1 - y0 < 30) return;
          if (x1 - x0 < Math.min(r.width, vw - 40) * 0.7 || y1 - y0 < Math.min(r.height, bottom - top) * 0.4) return;
          const pr = rng(Math.round(r.width * 7 + r.height * 13 + x0));
          const points: [number, number][] = PICTURE.has(kind)
            ? Array.from({ length: 2 + Math.floor(pr() * 2) }, () => [0.18 + pr() * 0.64, 0.18 + pr() * 0.64])
            : [];
          // foto e pôster valem mais que título
          const weight = PICTURE.has(kind) ? 1.3 : 1;
          found.push({
            el,
            ox: x0 - r.left,
            oy: y0 - r.top,
            w: x1 - x0,
            h: y1 - y0,
            vx: x0,
            vy: y0,
            kind,
            name: nameOf(el),
            points,
            area: (x1 - x0) * (y1 - y0) * weight,
          });
        });
      }
      found.sort((a, b) => b.area - a.area);
      const want = 2 + Math.floor(rand() * 4);
      const out: Target[] = [];
      for (const t of found) {
        // nada de caixas repetidas (a peça e a foto dela contam uma vez); um detalhe pequeno dentro de um
        // alvo grande (a assinatura no contrato) pode
        const clash = out.some((o) => {
          const ix = Math.min(o.vx + o.w, t.vx + t.w) - Math.max(o.vx, t.vx);
          const iy = Math.min(o.vy + o.h, t.vy + t.h) - Math.max(o.vy, t.vy);
          const small = Math.min(o.w * o.h, t.w * t.h);
          const big = Math.max(o.w * o.h, t.w * t.h);
          return ix > 0 && iy > 0 && ix * iy > 0.25 * small && small > 0.15 * big;
        });
        if (!clash) out.push(t);
        if (out.length === want) break;
      }
      // em ordem de leitura: as setas vão de uma à próxima
      return out.sort((a, b) => a.vy - b.vy || a.vx - b.vx);
    };

    const show = (on: boolean) => {
      if (on) {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(innerWidth * dpr);
        canvas.height = Math.round(innerHeight * dpr);
        canvas.style.display = 'block';
      } else {
        canvas.style.display = 'none';
        // sem leitura, o canvas não guarda memória
        canvas.width = canvas.height = 0;
      }
    };

    const draw = (time: number) => {
      const b = reading!;
      const life = time - b.t0;
      const fade = b.out == null ? 1 : 1 - (time - b.out) / FADE;
      if (fade <= 0) {
        reading = null;
        // a próxima leitura espera uma nova parada
        still = 0;
        show(false);
        return;
      }
      lastDraw = time;
      const sy = scrollY();
      // a página rolou: mede de novo onde cada alvo está (há salas presas na tela, que não andam
      // junto com a rolagem; assim a caixa fica sempre grudada no elemento)
      if (Math.abs(sy - measuredAt) > 0.5) {
        measuredAt = sy;
        for (const t of b.targets) {
          const r = t.el.getBoundingClientRect();
          t.vx = r.left + t.ox;
          t.vy = r.top + t.oy;
        }
        // rolando para cima, os alvos descem junto com a página: quando todos saem da tela, a leitura
        // termina (e a próxima parada pode ler o trecho onde o visitante está)
        const off = (t: Target) => !t.el.isConnected || t.vy > innerHeight || t.vy + t.h < 0 || t.vx > innerWidth || t.vx + t.w < 0;
        if (b.out == null && b.targets.every(off)) b.out = time;
      }
      if (time - lastData > 1 / 12) {
        lastData = time;
        const r = rng(b.seed + Math.floor(time * 12));
        data = b.targets.map(() => ({ jx: (r() - 0.5) * 2.4, jy: (r() - 0.5) * 2.4, conf: (0.9 + r() * 0.09).toFixed(2) }));
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      prepare(ctx, dpr);
      // sombra dura de 1 px: o traço claro continua legível por cima de foto clara
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.globalAlpha = Math.min(clamp01(life / 0.12), easeOut(clamp01(fade)));
      const at = (t: Target, i: number) => ({ x: t.vx + data[i].jx, y: t.vy + data[i].jy });
      const phase = (time * 25) % 8;
      // soltando: as caixas se abrem de novo enquanto somem
      const release = b.out == null ? 0 : (1 - fade) * 14;

      // as setas, de um alvo ao próximo, depois que os dois travaram
      for (let i = 0; i < b.targets.length - 1; i++) {
        const k = clamp01((life - 0.22 - i * 0.07) / 0.3);
        if (k <= 0) continue;
        const a = b.targets[i];
        const c = b.targets[i + 1];
        const pa = at(a, i);
        const pc = at(c, i + 1);
        const ax = pa.x + a.w / 2;
        const ay = pa.y + a.h / 2;
        const cx = pc.x + c.w / 2;
        const cy = pc.y + c.h / 2;
        // a curva cresce do primeiro alvo até o segundo
        const e = easeOut(k);
        arrowCurve(ctx, ax, ay, ax + (cx - ax) * e, ay + (cy - ay) * e, i % 2 ? -0.24 : 0.24, { arrows: 2, phase, dim: true });
      }

      b.targets.forEach((t, i) => {
        const k = clamp01((life - i * 0.07) / 0.22);
        if (k <= 0) return;
        const p = at(t, i);
        // trava: a caixa chega larga e fecha no alvo
        const infl = (1 - easeOut(k)) * 18 + release;
        const locked = k >= 1;
        box(ctx, p.x - 6 - infl, p.y - 6 - infl, t.w + 12 + infl * 2, t.h + 12 + infl * 2, {
          ticks: 12,
          dim: !locked,
          top: `ALVO ${pad(i + 1, 2)} · ${t.kind}`,
          bottom: locked ? `x: ${pad(p.x)} y: ${pad(p.y)} · W ${pad(t.w, 3)} H ${pad(t.h, 3)}` : undefined,
        });
        if (!locked) return;
        // a varredura: uma linha desce a caixa logo depois de travar
        const sweep = (life - i * 0.07 - 0.22) / 0.5;
        if (sweep > 0 && sweep < 1) {
          const ly = p.y + t.h * easeOut(sweep);
          ctx.globalAlpha *= 0.7;
          ctx.beginPath();
          ctx.moveTo(p.x, ly);
          ctx.lineTo(p.x + t.w, ly);
          ctx.stroke();
          ctx.globalAlpha /= 0.7;
        }
        const mx = p.x + t.w / 2;
        const my = p.y + t.h / 2;
        // nome do alvo, no canto de dentro da caixa
        if (t.name && t.w > 150 && t.h > 44) label(ctx, p.x + 6, p.y + 14, t.name);
        // pontos rastreados (fotos e pôsteres), ligados ao centro
        t.points.forEach(([fx, fy], j) => {
          const qx = p.x + t.w * fx;
          const qy = p.y + t.h * fy;
          ctx.strokeStyle = INK_DIM;
          ctx.beginPath();
          ctx.moveTo(qx, qy);
          ctx.lineTo(mx, my);
          ctx.stroke();
          marker(ctx, qx, qy, 5, `PT ${pad(j + 1, 2)}`, qx > mx ? 1 : -1);
        });
        marker(ctx, mx, my, 7, data[i].conf, mx > innerWidth / 2 ? -1 : 1);
      });

      // a ficha da leitura, junto do último alvo
      const last = b.targets[b.targets.length - 1];
      const pl = at(last, b.targets.length - 1);
      const lx = Math.min(innerWidth - 200, Math.max(20, pl.x));
      const ly = Math.min(innerHeight - 46, pl.y + last.h + 30);
      ctx.fillStyle = INK_DIM;
      label(ctx, lx, ly, `LEITURA ${pad(b.n, 3)} · ${pad(b.targets.length, 2)} ALVOS`);
      label(ctx, lx, ly + 13, `ROLAGEM ${pad(sy, 5)} PX · 12 FPS`);
      // pisca devagar: a leitura espera a próxima rolagem
      if (b.out == null && Math.floor(time * 1.5) % 2 === 0) label(ctx, lx, ly + 26, 'AGUARDANDO ROLAGEM ↓');
      ctx.globalAlpha = 1;
    };

    const tick = (time: number, dms: number) => {
      const lenis = getLenis();
      if (!lenis) return;
      const y = scrollY();
      const moving = Math.abs(lenis.velocity) > 0.05 || !!lenis.isScrolling;
      if (settleFrames > 0) settleFrames -= 1;
      if (Math.abs(lenis.velocity) > 0.5) scrolled = true;

      if (reading) {
        // rolou para baixo: a leitura se solta e some. Para cima, ela continua presa aos elementos
        if (reading.out == null) {
          reading.anchor = settleFrames > 0 && !wantsDown ? y : Math.min(reading.anchor, y);
          if ((wantsDown && y > reading.anchor) || y > reading.anchor + RELEASE_BAR || !allowed(y)) reading.out = time;
        }
        // parada, redesenha 12 vezes por segundo (os números saltam); rolando ou animando, a cada quadro
        const animating = time - reading.t0 < LOCK + reading.targets.length * 0.07 + 0.5 || reading.out != null;
        if (moving || animating || time - lastDraw > 1 / 12) draw(time);
        return;
      }

      // sem leitura: espera o visitante parar num trecho novo
      still = moving ? 0 : still + Math.min(dms, 250) / 1000;
      if (!scrolled || still < SETTLE) return;
      if (lastAt != null && Math.abs(y - lastAt) < innerHeight * NEW_CONTENT) return;
      if (!allowed(y)) return;
      const targets = pick();
      // sem o que ler aqui: não tenta de novo até a página andar. Um alvo só, se for grande
      lastAt = y;
      if (!targets.length || (targets.length < 2 && targets[0].w * targets[0].h < 0.12 * innerWidth * innerHeight)) return;
      count += 1;
      reading = { t0: time, out: null, targets, seed: (rand() * 2 ** 31) >>> 0, n: count, anchor: y, vw: innerWidth };
      lastData = -1;
      measuredAt = y;
      wantsDown = false;
      show(true);
      draw(time);
    };
    gsap.ticker.add(tick);
    // só em desenvolvimento: a próxima parada lê de novo, mesmo sem ter andado (para conferir o desenho)
    if (import.meta.env.DEV)
      (window as unknown as { __scan: object }).__scan = {
        fire: () => {
          lastAt = null;
          scrolled = true;
        },
        state: () => ({ reading: !!reading, lastAt, scrolled, still, allowed: allowed(scrollY()), zone, pick: pick().map((t) => `${t.kind} ${t.name}`) }),
      };

    const onResize = () => {
      if (!reading) return;
      if (innerWidth === reading.vw) {
        // só a altura mudou (no celular, a barra do navegador aparece ao rolar para cima): a leitura
        // fica; o canvas acompanha a janela e as caixas são medidas de novo no próximo quadro
        show(true);
        measuredAt = -1;
        lastDraw = -1;
        // o ScrollTrigger se mede de novo logo depois (e a rolagem pode saltar outra vez)
        settleFrames = Math.max(settleFrames, 45);
        return;
      }
      // a página mudou de largura e os elementos de tamanho: as caixas não valem mais. Quando a página
      // assentar, o mesmo trecho é lido de novo
      reading = null;
      lastAt = null;
      still = 0;
      show(false);
    };
    // para onde o visitante pediu para ir por último, de onde quer que venha
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY) wantsDown = e.deltaY > 0;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Spacebar') wantsDown = !e.shiftKey;
      else if (DOWN_KEYS.has(e.key)) wantsDown = true;
      else if (UP_KEYS.has(e.key)) wantsDown = false;
    };
    let touchY: number | null = null;
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      const ty = e.touches[0]?.clientY;
      if (touchY == null || ty == null) return;
      // o dedo sobe: a página desce (e vice-versa)
      if (touchY - ty > 12) wantsDown = true;
      else if (ty - touchY > 12) wantsDown = false;
    };
    const passive = { passive: true } as const;
    window.addEventListener('resize', onResize);
    window.addEventListener('wheel', onWheel, passive);
    window.addEventListener('keydown', onKey, passive);
    window.addEventListener('touchstart', onTouchStart, passive);
    window.addEventListener('touchmove', onTouchMove, passive);
    return () => {
      gsap.ticker.remove(tick);
      ScrollTrigger.removeEventListener('refresh', onRefresh);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  return <canvas ref={ref} className="scan" aria-hidden="true" />;
}
