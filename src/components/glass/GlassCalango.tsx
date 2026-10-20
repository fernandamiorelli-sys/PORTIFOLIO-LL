import { useEffect, useRef } from 'react';
import { isTouch, reducedMotion } from '../../lib/store';
import { BackdropPainter } from './backdrop';
import type { GlassRenderer } from './glassRenderer';
import { GlassOverlay } from './overlay';
import './glass.css';

/** Onde o calango fica, em frações do palco: centro (x, y) e altura. */
export interface GlassPlace {
  x: number;
  y: number;
  h: number;
}

/**
 * O calango de vidro do manifesto: a peça gira sozinha (o scroll não mexe nela), refrata a página que
 * está atrás e carrega por cima o data overlay que lê a forma do logo. Só renderiza quando está na tela.
 */
export function GlassCalango({ place, compact }: { place: GlassPlace; compact: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const api = useRef<{ setPlace: (p: GlassPlace, animate: boolean) => void; compact: boolean } | null>(null);

  useEffect(() => {
    const host = hostRef.current!;
    const stage = host.parentElement as HTMLElement; // o palco sticky do manifesto
    const section = stage.parentElement as HTMLElement;
    let alive = true;
    let glass: GlassRenderer | null = null;
    let painter: BackdropPainter | null = null;
    let overlay: GlassOverlay | null = null;
    let raf = 0;
    let visible = false;
    let dirtyUntil = 0;
    /** o trilho de progresso mudou (a cada quadro, durante as frases): basta repintar devagar */
    let slowDirty = false;
    let lastPaint = -1e9;
    let shownAt = -1;
    /** com movimento reduzido a peça fica parada: só desenha de novo quando algo muda */
    let needsRender = true;
    let target: GlassPlace = place;
    let size = { w: 1, h: 1 };
    /** só em desenvolvimento: congela o giro num instante, para comparar quadros */
    let frozen: number | null = null;
    // rede de segurança para aparelho fraco: se os quadros passam de ~34 ms de forma consistente, a
    // peça renderiza com menos pixels por ponto (nunca abaixo de 1); num aparelho que dá conta, nada muda
    let quality = 1;
    let lastFrame = 0;
    const intervals: number[] = [];
    const t0 = performance.now();

    const toPx = (p: GlassPlace) => ({ cx: p.x * size.w, cy: p.y * size.h, height: p.h * size.h });

    const glassDpr = () => {
      const full = Math.min(window.devicePixelRatio || 1, 2);
      return Math.max(Math.min(1, full), full * quality);
    };

    const resize = () => {
      if (!glass || !painter || !overlay) return;
      size = { w: stage.clientWidth, h: stage.clientHeight };
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      glass.resize(size.w, size.h, glassDpr());
      // a réplica da página: resolução da tela, até ~2,1 megapixels (1,4 no celular, onde subir a textura
      // custa mais); o vidro distorce, mais que isso não aparece
      const budget = isTouch ? 1.4e6 : 2.1e6;
      const scale = Math.min(window.devicePixelRatio || 1, Math.sqrt(budget / Math.max(1, size.w * size.h)));
      painter.resize(size.w, size.h, scale);
      overlay.resize(size.w, size.h, dpr);
      const bar = stage.querySelector('.manifesto__bar');
      overlay.safeTop = bar ? bar.getBoundingClientRect().bottom - stage.getBoundingClientRect().top : 0;
      glass.place(toPx(target));
      dirtyUntil = performance.now() + 50;
      needsRender = true;
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!glass || !painter || !overlay) return;
      // a réplica só é redesenhada quando a página muda: 24 vezes por segundo enquanto as letras e as
      // tarjas se mexem (atrás do vidro, distorcido, não se vê diferença para 60) e 4 por segundo para
      // o trilho de progresso, que anda o tempo todo mas quase nunca fica atrás da peça
      if ((now < dirtyUntil && now - lastPaint > 41) || (slowDirty && now - lastPaint > 250)) {
        painter.paint();
        glass.bgTexture.needsUpdate = true;
        lastPaint = now;
        slowDirty = false;
        needsRender = true;
      }
      if (reducedMotion && !needsRender && frozen == null) return;
      needsRender = false;
      if (shownAt < 0) shownAt = now;
      if (lastFrame && now - lastFrame < 250) intervals.push(now - lastFrame);
      lastFrame = now;
      if (intervals.length >= 90) {
        const median = intervals.sort((a, b) => a - b)[45];
        intervals.length = 0;
        if (median > 34 && quality > 0.6 && now - shownAt > 1500) {
          quality *= 0.75;
          glass.resize(size.w, size.h, glassDpr());
        }
      }
      const reveal = reducedMotion ? 1 : Math.min(1, (now - shownAt) / 900);
      glass.render(now / 1000, frozen ?? (now - t0) / 1000, reveal);
      overlay.update(now, glass, { compact: api.current?.compact ?? false, alpha: reveal, force: frozen != null || reducedMotion, still: reducedMotion });
    };

    const start = () => {
      if (raf || !glass || !visible || document.hidden) return;
      dirtyUntil = performance.now() + 100;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      lastFrame = 0;
    };

    // a página atrás do vidro mudou (letras subindo a escada, tarjas, flashes, troca de estado):
    // pinta de novo enquanto durarem as transições do CSS que a mudança disparou
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target instanceof Element ? r.target : r.target.parentElement;
        if (el?.closest('.manifesto__rail')) {
          slowDirty = true;
          continue;
        }
        dirtyUntil = performance.now() + 1400;
        return;
      }
    });
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        if (visible) start();
        else stop();
      },
      { rootMargin: '10% 0px' },
    );
    const ro = new ResizeObserver(() => resize());
    const onVis = () => (document.hidden ? stop() : start());

    // three.js chega à parte (já pré-carregado durante a abertura): a página não espera por ele
    Promise.all([import('./asset').then((m) => m.loadGlassCalango()), import('./glassRenderer')])
      .then(async ([asset, { GlassRenderer }]) => {
        if (!alive) return;
        const canvas = document.createElement('canvas');
        canvas.className = 'glass__gl';
        painter = new BackdropPainter(stage);
        glass = new GlassRenderer(canvas, asset, painter.canvas);
        glass.reduced = reducedMotion;
        overlay = new GlassOverlay(asset.header);
        overlay.canvas.className = 'glass__overlay';
        host.append(canvas, overlay.canvas);
        resize();
        await glass.compile();
        if (!alive) return;
        mo.observe(section, { subtree: true, attributes: true, attributeFilter: ['data-l', 'class', 'style'], childList: true, characterData: true });
        io.observe(stage);
        ro.observe(stage);
        document.addEventListener('visibilitychange', onVis);
      })
      .catch(() => {
        // sem WebGL ou sem o arquivo: o manifesto continua inteiro, só sem a peça
        host.dataset.state = 'off';
      });

    if (import.meta.env.DEV) {
      (window as unknown as { __glass: object }).__glass = {
        freeze: (t: number | null) => {
          frozen = t;
          dirtyUntil = performance.now() + 200;
        },
        get: () => ({ glass, painter, overlay }),
      };
    }

    api.current = {
      compact,
      setPlace: (p, animate) => {
        target = p;
        needsRender = true;
        if (glass) glass.place(toPx(p), animate && !reducedMotion ? performance.now() / 1000 : undefined, 1.3);
      },
    };

    return () => {
      alive = false;
      stop();
      mo.disconnect();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      glass?.dispose();
      host.replaceChildren();
    };
    // a peça é criada uma vez; lugar e modo chegam pelos efeitos abaixo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!api.current) return;
    api.current.compact = compact;
    api.current.setPlace(place, true);
  }, [place.x, place.y, place.h, compact]);

  return <div ref={hostRef} className="glass" aria-hidden="true" />;
}
