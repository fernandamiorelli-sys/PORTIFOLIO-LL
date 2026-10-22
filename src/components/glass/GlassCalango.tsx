import { useEffect, useRef } from 'react';
import { getLenis, ScrollTrigger } from '../../lib/scroll';
import { isTouch, reducedMotion } from '../../lib/store';
import { BackdropPainter } from './backdrop';
import type { GlassRenderer } from './glassRenderer';
import { HitShape } from './outline';
import { GlassOverlay } from './overlay';
import { FRONT, Spin } from './spin';
import './glass.css';

/** Onde o calango fica, em frações do palco: centro (x, y) e altura. */
export interface GlassPlace {
  x: number;
  y: number;
  h: number;
}

/**
 * O calango de vidro do manifesto. Fica sempre no mesmo lugar e só gira, devagar, no próprio eixo (o
 * scroll não mexe nele). Com o cursor em cima, vira para o visitante, inclina na direção do ponteiro e
 * a luz acompanha; arrastar gira com inércia (no celular: tocar segura a peça, deslizar para o lado
 * gira). Refrata a página que está atrás e carrega por cima o data overlay que lê a forma do logo.
 */
export function GlassCalango({ place, compact }: { place: GlassPlace; compact: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const api = useRef<{ setPlace: (p: GlassPlace) => void; compact: boolean } | null>(null);

  useEffect(() => {
    const host = hostRef.current!;
    const stage = host.parentElement as HTMLElement; // o palco sticky do manifesto
    const section = stage.parentElement as HTMLElement;
    let alive = true;
    let glass: GlassRenderer | null = null;
    let painter: BackdropPainter | null = null;
    let overlay: GlassOverlay | null = null;
    let hit: HitShape | null = null;
    const spin = new Spin();
    spin.reduced = reducedMotion;
    if (reducedMotion) {
      // parada, de frente
      spin.angle = FRONT;
      spin.vel = 0;
    }
    let raf = 0;
    let visible = false;
    let dirtyUntil = 0;
    /** o trilho de progresso mudou (a cada quadro, durante as frases): basta repintar devagar */
    let slowDirty = false;
    /** um flash do acervo acendeu ou apagou: basta remontar a réplica (troca seca, sem transição) */
    let flashDirty = false;
    let lastPaint = -1e9;
    let lastComposite = -1e9;
    let shownAt = -1;
    let lastNow = 0;
    /** com movimento reduzido a peça fica parada: só desenha de novo quando algo muda */
    let needsRender = true;
    let target: GlassPlace = place;
    let size = { w: 1, h: 1 };
    /** só em desenvolvimento: congela o giro num ângulo, para comparar quadros (e a qualidade não muda) */
    let frozen: number | null = null;
    // rede de segurança para aparelho fraco: se os quadros passam de ~34 ms de forma consistente, a
    // peça renderiza com menos pixels por ponto (nunca abaixo de 1); num aparelho que dá conta, nada muda
    let quality = 1;
    let lastFrame = 0;
    const intervals: number[] = [];

    // onde o palco está na tela sem medir a cada quadro: a seção no documento + a rolagem (o palco é
    // sticky no topo da seção)
    let sectionTop = 0;
    let sectionHeight = 0;
    let stageLeft = 0;
    const measureSection = () => {
      const r = section.getBoundingClientRect();
      sectionTop = r.top + window.scrollY;
      sectionHeight = section.offsetHeight;
      stageLeft = r.left;
    };
    const stageTop = () => {
      const natural = sectionTop - (getLenis()?.animatedScroll ?? window.scrollY);
      return Math.min(Math.max(natural, 0), natural + sectionHeight - size.h);
    };

    // o ponteiro (px da janela), se ele está sobre a peça, e o toque em curso
    let pointer: { x: number; y: number } | null = null;
    let hovered = false;
    const lockAt = { x: 0, y: 0 };
    let touch: { id: number; x0: number; y0: number; mode: 'hold' | 'spin' | 'scroll' } | null = null;

    const toPx = (p: GlassPlace) => ({ cx: p.x * size.w, cy: p.y * size.h, height: p.h * size.h });
    /** largura da peça de frente, na tela (arrastar uma largura gira quase um terço de volta) */
    const frontWidth = () => target.h * size.h * 0.64;

    const glassDpr = () => {
      const full = Math.min(window.devicePixelRatio || 1, 2);
      return Math.max(Math.min(1, full), full * quality);
    };

    /** os canvas cobrem só o recorte em que a peça cabe (quem escolhe é o renderizador) e, no do
     *  overlay, a folga das legendas em volta: o resto do palco seria transparente */
    const fitCanvas = () => {
      if (!glass || !overlay) return;
      overlay.fit(glass.crop);
      for (const [el, c] of [
        [glass.canvas, glass.crop],
        [overlay.canvas, overlay.crop],
      ] as const) {
        Object.assign(el.style, { left: `${c.x}px`, top: `${c.y}px`, width: `${c.w}px`, height: `${c.h}px`, right: 'auto', bottom: 'auto' });
      }
    };

    const resize = () => {
      if (!glass || !painter || !overlay) return;
      size = { w: stage.clientWidth, h: stage.clientHeight };
      measureSection();
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
      fitCanvas();
      dirtyUntil = performance.now() + 50;
      needsRender = true;
    };

    /** o cursor (ou o dedo) está sobre a peça? Entra pela silhueta; sai só ao deixar a caixa dela */
    const updateHover = () => {
      let over = false;
      if (pointer && hit) {
        const x = pointer.x - stageLeft;
        const y = pointer.y - stageTop();
        over = spin.isDragging || (hovered ? hit.inBox(x, y, 28) : hit.contains(x, y));
        // posição relativa ao centro da peça de frente (estável enquanto ela gira)
        const c = toPx(target);
        spin.pointer(over, (x - c.cx) / (c.height * 0.32), (y - c.cy) / (c.height * 0.5));
        lockAt.x = x;
        lockAt.y = y;
      } else {
        spin.pointer(false, 0, 0);
      }
      if (over !== hovered) {
        hovered = over;
        // o cursor do site mostra o que dá para fazer
        if (over) stage.dataset.cursor = 'Girar';
        else delete stage.dataset.cursor;
      }
      return over;
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!glass || !painter || !overlay || !hit) return;
      const dt = lastNow ? (now - lastNow) / 1000 : 0;
      lastNow = now;
      // a réplica só é redesenhada quando a página muda: 24 vezes por segundo enquanto as letras e as
      // tarjas se mexem (atrás do vidro, distorcido, não se vê diferença para 60) e 4 por segundo para
      // o trilho de progresso, que anda o tempo todo mas quase nunca fica atrás da peça. Um flash que
      // troca não mexe no texto: só remonta a réplica com a foto nova
      if ((now < dirtyUntil && now - lastPaint > 41) || (slowDirty && now - lastPaint > 250)) {
        painter.paint();
        glass.bgTexture.needsUpdate = true;
        lastPaint = lastComposite = now;
        slowDirty = false;
        flashDirty = false;
        needsRender = true;
      } else if (flashDirty && now - lastComposite > 50) {
        painter.composite();
        glass.bgTexture.needsUpdate = true;
        lastComposite = now;
        flashDirty = false;
        needsRender = true;
      }
      const engaged = updateHover();
      if (frozen != null) spin.angle = frozen;
      else spin.step(dt);
      // parado (movimento reduzido), só desenha quando algo muda: a página atrás, o cursor, o arrasto
      if (reducedMotion && !needsRender && !engaged && !spin.isDragging && spin.light.amount < 0.002 && frozen == null) return;
      needsRender = false;
      if (shownAt < 0) shownAt = now;
      if (lastFrame && now - lastFrame < 250) intervals.push(now - lastFrame);
      lastFrame = now;
      if (intervals.length >= 90) {
        const median = intervals.sort((a, b) => a - b)[45];
        intervals.length = 0;
        if (median > 34 && quality > 0.6 && now - shownAt > 1500 && frozen == null) {
          quality *= 0.75;
          glass.resize(size.w, size.h, glassDpr());
          fitCanvas();
        }
      }
      const reveal = reducedMotion ? 1 : Math.min(1, (now - shownAt) / 900);
      glass.render(spin.angle, spin.tilt, spin.light, reveal);
      hit.update(glass);
      overlay.update(now, glass, {
        compact: api.current?.compact ?? false,
        alpha: reveal,
        force: frozen != null || reducedMotion,
        still: reducedMotion,
        lock: spin.hover > 0.02 ? { x: lockAt.x, y: lockAt.y, amount: spin.hover } : undefined,
      });
    };

    const start = () => {
      if (raf || !glass || !visible || document.hidden) return;
      dirtyUntil = performance.now() + 100;
      lastNow = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      lastFrame = 0;
    };

    // ── ponteiro: passar por cima segura e vira a peça; arrastar gira (com inércia ao soltar)
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      pointer = { x: e.clientX, y: e.clientY };
      if (spin.isDragging) spin.move(e.clientX, e.timeStamp / 1000);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.button !== 0 || !hovered) return;
      spin.down(e.clientX, frontWidth(), e.timeStamp / 1000);
      // arrastando, o texto da página não é selecionado (e o arrasto continua fora da janela)
      document.documentElement.classList.add('is-spinning');
      (e.target as Element).setPointerCapture?.(e.pointerId);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || !spin.isDragging) return;
      spin.up(e.timeStamp / 1000);
      document.documentElement.classList.remove('is-spinning');
    };
    const onPointerOut = (e: PointerEvent) => {
      // o mouse saiu da janela
      if (!e.relatedTarget && e.pointerType !== 'touch') pointer = null;
    };

    // ── toque: tocar na peça a segura (ela encara o dedo); deslizar para o lado gira; deslizar para
    // cima ou para baixo é rolagem, e a peça solta. Nada aqui impede a rolagem da página.
    const findTouch = (list: TouchList) => (touch ? Array.from(list).find((t) => t.identifier === touch!.id) : undefined);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || !hit) return;
      const t = e.touches[0];
      if (!hit.contains(t.clientX - stageLeft, t.clientY - stageTop())) return;
      touch = { id: t.identifier, x0: t.clientX, y0: t.clientY, mode: 'hold' };
      pointer = { x: t.clientX, y: t.clientY };
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = findTouch(e.touches);
      if (!touch || !t) return;
      const dx = t.clientX - touch.x0;
      const dy = t.clientY - touch.y0;
      if (touch.mode === 'hold' && Math.hypot(dx, dy) > 10) {
        touch.mode = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'spin' : 'scroll';
        if (touch.mode === 'spin') spin.down(touch.x0, frontWidth(), e.timeStamp / 1000);
      }
      if (touch.mode === 'scroll') pointer = null;
      else pointer = { x: t.clientX, y: t.clientY };
      if (touch.mode === 'spin') spin.move(t.clientX, e.timeStamp / 1000);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!touch || findTouch(e.touches)) return;
      if (touch.mode === 'spin') spin.up(e.timeStamp / 1000);
      touch = null;
      pointer = null;
    };

    // a página atrás do vidro mudou (letras subindo a escada, tarjas, troca de estado): pinta de novo
    // enquanto durarem as transições do CSS que a mudança disparou. Os flashes trocam seco, várias vezes
    // por segundo: para eles, uma repintura por troca
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target instanceof Element ? r.target : r.target.parentElement;
        if (el?.closest('.manifesto__rail')) {
          slowDirty = true;
          continue;
        }
        if (el?.closest('.manifesto__flash')) {
          flashDirty = true;
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
    const passive = { passive: true } as const;

    // three.js chega à parte (já pré-carregado durante a abertura): a página não espera por ele
    Promise.all([import('./asset').then((m) => m.loadGlassCalango()), import('./glassRenderer')])
      .then(async ([asset, { GlassRenderer }]) => {
        if (!alive) return;
        const canvas = document.createElement('canvas');
        canvas.className = 'glass__gl';
        painter = new BackdropPainter(stage);
        glass = new GlassRenderer(canvas, asset, painter.canvas);
        overlay = new GlassOverlay(asset.header);
        overlay.canvas.className = 'glass__overlay';
        hit = new HitShape(asset.header);
        host.append(canvas, overlay.canvas);
        resize();
        await glass.compile();
        if (!alive) return;
        mo.observe(section, { subtree: true, attributes: true, attributeFilter: ['data-l', 'class', 'style'], childList: true, characterData: true });
        io.observe(stage);
        ro.observe(stage);
        document.addEventListener('visibilitychange', onVis);
        ScrollTrigger.addEventListener('refresh', measureSection);
        window.addEventListener('pointermove', onPointerMove, passive);
        window.addEventListener('pointerdown', onPointerDown, passive);
        window.addEventListener('pointerup', onPointerUp, passive);
        window.addEventListener('pointercancel', onPointerUp, passive);
        document.addEventListener('pointerout', onPointerOut, passive);
        window.addEventListener('touchstart', onTouchStart, passive);
        window.addEventListener('touchmove', onTouchMove, passive);
        window.addEventListener('touchend', onTouchEnd, passive);
        window.addEventListener('touchcancel', onTouchEnd, passive);
      })
      .catch(() => {
        // sem WebGL ou sem o arquivo: o manifesto continua inteiro, só sem a peça
        host.dataset.state = 'off';
      });

    if (import.meta.env.DEV) {
      (window as unknown as { __glass: object }).__glass = {
        freeze: (angle: number | null) => {
          frozen = angle;
          dirtyUntil = performance.now() + 200;
        },
        get: () => ({ glass, painter, overlay, spin, hit }),
      };
    }

    api.current = {
      compact,
      setPlace: (p) => {
        target = p;
        needsRender = true;
        if (glass) {
          glass.place(toPx(p));
          fitCanvas();
        }
      },
    };

    return () => {
      alive = false;
      stop();
      mo.disconnect();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      ScrollTrigger.removeEventListener('refresh', measureSection);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      document.removeEventListener('pointerout', onPointerOut);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      delete stage.dataset.cursor;
      document.documentElement.classList.remove('is-spinning');
      glass?.dispose();
      painter?.dispose();
      host.replaceChildren();
    };
    // a peça é criada uma vez; lugar e modo chegam pelos efeitos abaixo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!api.current) return;
    api.current.compact = compact;
    api.current.setPlace(place);
  }, [place.x, place.y, place.h, compact]);

  return <div ref={hostRef} className="glass" aria-hidden="true" />;
}
