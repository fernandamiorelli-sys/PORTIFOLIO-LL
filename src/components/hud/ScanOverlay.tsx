import { useEffect, useRef } from 'react';
import { arrowCurve, box, INK_DIM, label, marker, prepare, rng } from '../../lib/dataOverlay';
import { getLenis, gsap } from '../../lib/scroll';
import { experience, reducedMotion } from '../../lib/store';
import './scan.css';

// Data overlay ocasional: de tempos em tempos (a cada ~12 s de rolagem), a página é "lida" por um
// instante. Duas a quatro coisas na tela (fotos, pôsteres, títulos) ganham caixa de rastreamento,
// coordenadas e setas tracejadas ligando uma à outra, e tudo some em pouco mais de um segundo.
// O manifesto tem a própria leitura (sobre o calango de vidro): ali, com a ficha ou o índice
// abertos, ou com movimento reduzido, nada acontece.

const TARGETS: [string, string][] = [
  ['.hero__frame', 'RETRATO'],
  ['.card__media', 'PEÇA'],
  ['.bid-entry__poster', 'PÔSTER'],
  ['.confrontos__poster', 'PÔSTER'],
  ['.screening__player', 'FILME'],
  ['.vitrine img', 'CAMISA'],
  ['.led', 'PAINEL'],
  ['main img', 'IMAGEM'],
  ['main h2', 'TÍTULO'],
  ['main h3', 'TÍTULO'],
  ['main p.t-body', 'TEXTO'],
];

/** duração de uma leitura (s) e quanto rolar entre uma e outra (s de rolagem de verdade) */
const DURATION = 1.15;
const EVERY: [number, number] = [10.5, 14];

interface Target {
  /** caixa visível, com y no documento (acompanha a rolagem sem medir de novo) */
  x: number;
  y: number;
  w: number;
  h: number;
  kind: string;
}

const pad = (n: number, k = 4) => String(Math.max(0, Math.round(n))).padStart(k, '0');
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function ScanOverlay() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (reducedMotion) return;
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const rand = rng((Math.random() * 2 ** 31) >>> 0);
    let acc = 0;
    let next = EVERY[0] + rand() * (EVERY[1] - EVERY[0]);
    let count = 0;
    let burst: { t0: number; targets: Target[]; seed: number } | null = null;
    let dpr = 1;
    // os números saltam (12 por segundo); as caixas acompanham a rolagem a cada quadro
    let lastData = -1;
    let data: { jx: number; jy: number; conf: string }[] = [];

    const scrollY = () => getLenis()?.animatedScroll ?? window.scrollY;

    const allowed = () => {
      const s = experience.get();
      const lenis = getLenis();
      if (s.phase !== 'site' || s.sheet || !lenis || lenis.isStopped) return false;
      const m = document.getElementById('manifesto')?.getBoundingClientRect();
      return !m || m.top > innerHeight * 0.8 || m.bottom < innerHeight * 0.2;
    };

    /** o que está inteiro (ou quase) na faixa útil da tela, do maior para o menor, sem repetidos */
    const pick = (): Target[] => {
      const vw = innerWidth;
      const vh = innerHeight;
      const top = vh * 0.12;
      const bottom = vh * 0.88;
      const sy = scrollY();
      const found: (Target & { area: number })[] = [];
      for (const [sel, kind] of TARGETS) {
        document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
          if (el.closest('#manifesto')) return;
          if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return;
          const r = el.getBoundingClientRect();
          const x0 = Math.max(r.left, 20);
          const x1 = Math.min(r.right, vw - 20);
          const y0 = Math.max(r.top, top);
          const y1 = Math.min(r.bottom, bottom);
          // um bom pedaço à vista (a caixa pega só o que aparece, entre as barras do HUD)
          if (x1 - x0 < 80 || y1 - y0 < 34) return;
          if (x1 - x0 < Math.min(r.width, vw - 40) * 0.7 || y1 - y0 < Math.min(r.height, bottom - top) * 0.4) return;
          // imagem e título valem mais que parágrafo
          const weight = kind === 'TEXTO' ? 0.5 : 1;
          found.push({ x: x0, y: y0 + sy, w: x1 - x0, h: y1 - y0, kind, area: (x1 - x0) * (y1 - y0) * weight });
        });
      }
      found.sort((a, b) => b.area - a.area);
      const want = 2 + Math.floor(rand() * 3);
      const out: Target[] = [];
      for (const t of found) {
        // nada de caixa dentro de caixa: a peça e a foto dela contam uma vez
        const clash = out.some((o) => {
          const ix = Math.min(o.x + o.w, t.x + t.w) - Math.max(o.x, t.x);
          const iy = Math.min(o.y + o.h, t.y + t.h) - Math.max(o.y, t.y);
          return ix > 0 && iy > 0 && ix * iy > 0.25 * Math.min(o.w * o.h, t.w * t.h);
        });
        if (!clash) out.push(t);
        if (out.length === want) break;
      }
      // em ordem de leitura: as setas vão de uma à próxima
      return out.sort((a, b) => a.y - b.y || a.x - b.x);
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
      const b = burst!;
      const u = (time - b.t0) / DURATION;
      if (u >= 1) {
        burst = null;
        show(false);
        return;
      }
      const sy = scrollY();
      if (time - lastData > 1 / 12) {
        lastData = time;
        const r = rng(b.seed + Math.floor(time * 12));
        data = b.targets.map(() => ({ jx: (r() - 0.5) * 3, jy: (r() - 0.5) * 3, conf: (0.9 + r() * 0.09).toFixed(2) }));
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      prepare(ctx, dpr);
      // sombra dura de 1 px: o traço claro continua legível por cima de foto clara
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.globalAlpha = Math.min(clamp01(u / 0.08), clamp01((1 - u) / 0.22));
      const at = (t: Target, i: number) => ({ x: t.x + data[i].jx, y: t.y - sy + data[i].jy });
      const phase = (time * 25) % 8;

      // as setas, de um alvo ao próximo, depois que os dois travaram
      for (let i = 0; i < b.targets.length - 1; i++) {
        const k = clamp01((u * DURATION - 0.22 - i * 0.07) / 0.25);
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
        const k = clamp01((u * DURATION - i * 0.07) / 0.2);
        if (k <= 0) return;
        const p = at(t, i);
        // trava: a caixa chega larga e fecha no alvo
        const infl = (1 - easeOut(k)) * 18;
        box(ctx, p.x - 6 - infl, p.y - 6 - infl, t.w + 12 + infl * 2, t.h + 12 + infl * 2, {
          ticks: 12,
          dim: k < 1,
          top: `ALVO ${pad(i + 1, 2)} · ${t.kind}`,
          bottom: k < 1 ? undefined : `x: ${pad(p.x)} y: ${pad(p.y)}`,
        });
        if (k >= 1) marker(ctx, p.x + t.w / 2, p.y + t.h / 2, 7, data[i].conf, p.x + t.w / 2 > innerWidth / 2 ? -1 : 1);
      });

      // a ficha da leitura, junto do último alvo
      const last = b.targets[b.targets.length - 1];
      const pl = at(last, b.targets.length - 1);
      const lx = Math.min(innerWidth - 190, Math.max(20, pl.x));
      const ly = Math.min(innerHeight - 40, pl.y + last.h + 30);
      ctx.fillStyle = INK_DIM;
      label(ctx, lx, ly, `LEITURA ${pad(count, 3)} · ${pad(b.targets.length, 2)} ALVOS`);
      label(ctx, lx, ly + 13, `ROLAGEM ${pad(sy, 5)} PX · 12 FPS`);
      ctx.globalAlpha = 1;
    };

    const tick = (time: number, dms: number) => {
      if (burst) {
        draw(time);
        return;
      }
      const lenis = getLenis();
      if (!lenis || lenis.isStopped) return;
      if (Math.abs(lenis.velocity) > 0.6) acc += Math.min(dms, 100) / 1000;
      if (acc < next) return;
      // fora de hora (manifesto, ficha aberta) ou sem o que ler: tenta de novo depois de mais um pouco
      const targets = allowed() ? pick() : [];
      if (targets.length < 2) {
        acc = next - 1;
        return;
      }
      acc = 0;
      next = EVERY[0] + rand() * (EVERY[1] - EVERY[0]);
      count += 1;
      burst = { t0: time, targets, seed: (rand() * 2 ** 31) >>> 0 };
      lastData = -1;
      show(true);
      draw(time);
    };
    gsap.ticker.add(tick);
    // só em desenvolvimento: dispara a próxima leitura já (para conferir o desenho)
    if (import.meta.env.DEV) (window as unknown as { __scan: object }).__scan = { fire: () => (acc = next) };

    const onResize = () => {
      if (!burst) return;
      burst = null;
      show(false);
    };
    window.addEventListener('resize', onResize);
    return () => {
      gsap.ticker.remove(tick);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return <canvas ref={ref} className="scan" aria-hidden="true" />;
}
