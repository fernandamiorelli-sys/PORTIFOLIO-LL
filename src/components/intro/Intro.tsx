import { useCallback, useEffect, useRef, useState } from 'react';
import { SITE } from '../../data/site';
import { audio } from '../../lib/audio';
import { bestFormat, imageUrl, loadImage } from '../../lib/media';
import { experience, isTouch, reducedMotion, useExperience } from '../../lib/store';
import { DataField } from './dataField';
import { GlassRenderer } from './glass';
import { HackingScreen } from './HackingScreen';
import { createScratchTexture } from './scratches';
import { drawTitleArt, type TitleLayout } from './titleArt';
import './intro.css';

// Abertura: boot (desfoque de 1 s) → title screen no vidro → hacking (0:09–0:14) → site.

const IGNORED_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape']);

async function preloadAll(onProgress: (k: number) => void) {
  const fmt = await bestFormat;
  const tasks: Promise<unknown>[] = [
    document.fonts.ready,
    document.fonts.load('900 extra-condensed 80px "Anybody Variable"'),
    document.fonts.load('400 12px "Martian Mono Variable"'),
    document.fonts.load('italic 400 40px "Bodoni Moda Variable"'),
    audio.preload(),
    loadImage(imageUrl('lucas-lopes-dono', 900, fmt)),
    loadImage(imageUrl('lucas-lopes-dono-pb', 900, fmt)).catch(() => null),
    import('../three/Stage'),
  ];
  let done = 0;
  onProgress(0.04);
  await Promise.all(
    tasks.map((t) =>
      Promise.resolve(t)
        .catch(() => null)
        .finally(() => onProgress(Math.min(1, ++done / tasks.length))),
    ),
  );
}

export function Intro({ onEnterSite }: { onEnterSite: () => void }) {
  const phase = useExperience((s) => s.phase);
  const loaded = useExperience((s) => s.loaded);
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GlassRenderer | null>(null);
  const [layout, setLayout] = useState<TitleLayout | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const ready = loaded >= 1;

  // render loop da title screen
  useEffect(() => {
    // um canvas novo por montagem: duas instâncias nunca dividem o mesmo contexto WebGL
    const host = hostRef.current!;
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    let alive = true;
    let renderer: GlassRenderer;
    try {
      renderer = new GlassRenderer(canvas);
    } catch {
      host.classList.add('is-fallback');
      return () => canvas.remove();
    }
    rendererRef.current = renderer;
    renderer.autoLight = isTouch;
    const data = new DataField();
    const titleCanvas = document.createElement('canvas');
    let crest: HTMLImageElement | null = null;
    let raf = 0;
    let last = performance.now();
    let lastScratch = { w: 0, h: 0 };

    const layoutAll = () => {
      if (!alive) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      renderer.resize(w * dpr, h * dpr);
      data.resize(w, h);
      if (Math.abs(lastScratch.w - w) > 120 || Math.abs(lastScratch.h - h) > 120) {
        renderer.upload('scratch', createScratchTexture(Math.round(w * dpr), Math.round(h * dpr)));
        lastScratch = { w, h };
      }
      setLayout(drawTitleArt(titleCanvas, crest, w, h, dpr));
      renderer.upload('title', titleCanvas);
    };

    (async () => {
      const fmt = await bestFormat;
      crest = await loadImage(imageUrl('sangue-frio-novo-escudo', 960, fmt)).catch(() => null);
      await document.fonts.load('900 extra-condensed 80px "Anybody Variable"').catch(() => null);
      layoutAll();
    })();
    layoutAll();

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(layoutAll, 120);
    };
    window.addEventListener('resize', onResize);

    const onMove = (e: PointerEvent) => {
      renderer.pointer(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight);
    };
    window.addEventListener('pointermove', onMove);

    // glitches ocasionais, como na title screen de Cyberpunk 2077
    let nextGlitch = performance.now() + 1800;
    const born = performance.now();
    const tick = (stamp: number) => {
      // o carimbo do rAF pode vir antes do performance.now() da montagem: nunca deixe dt negativo
      const now = Math.max(stamp, performance.now());
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
      last = now;
      if (data.shouldDraw(now)) {
        data.draw(dt * 2);
        renderer.upload('data', data.canvas);
      }
      if (!reducedMotion && now > nextGlitch) {
        renderer.glitch(0.35 + Math.random() * 0.5, 90 + Math.random() * 170);
        nextGlitch = now + 2600 + Math.random() * 4200;
      }
      renderer.reveal = Math.max(0, Math.min(1, (now - born - 900) / 700));
      renderer.render(now);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      renderer.dispose();
      rendererRef.current = null;
      canvas.remove();
    };
  }, []);

  // boot: 1 s de desfoque e depois a title screen
  useEffect(() => {
    void preloadAll((k) => experience.set({ loaded: k }));
    const t = window.setTimeout(() => experience.set({ phase: 'title' }), reducedMotion ? 0 : 1000);
    return () => window.clearTimeout(t);
  }, []);

  const begin = useCallback(
    (silent = false) => {
      if (experience.get().phase !== 'title' || !ready) return;
      if (silent) audio.setMuted(true);
      void audio.start();
      rendererRef.current?.glitch(1.2, 420);
      experience.set({ phase: 'hacking' });
    },
    [ready],
  );

  useEffect(() => {
    if (phase !== 'title') return;
    const onKey = (e: KeyboardEvent) => {
      if (IGNORED_KEYS.has(e.key) || e.repeat) return;
      if ((e.target as HTMLElement)?.closest?.('[data-intro-option]')) return;
      e.preventDefault();
      begin();
    };
    const onPointer = (e: PointerEvent) => {
      if ((e.target as HTMLElement)?.closest?.('[data-intro-option]')) return;
      begin();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [phase, begin]);

  const finishHacking = useCallback(() => {
    setLeaving(true);
    experience.set({ phase: 'site' });
    onEnterSite();
    window.setTimeout(() => setGone(true), 1400);
  }, [onEnterSite]);

  if (gone) return null;

  const pct = String(Math.round(loaded * 100)).padStart(3, '0');
  const promptStyle = layout
    ? layout.align === 'left'
      ? { left: layout.block.x, top: layout.promptY }
      : { left: '50%', top: layout.promptY, transform: 'translateX(-50%)', textAlign: 'center' as const }
    : undefined;

  return (
    <div className={`intro phase-${phase} ${leaving ? 'is-leaving' : ''}`}>
      <div ref={hostRef} className="intro__glass" aria-hidden="true" />

      <h1 className="sr-only">
        {SITE.title} — {SITE.club}, por {SITE.author}
      </h1>

      <div className="intro__hud t-mono" aria-hidden="true">
        <span className="intro__corner is-tl">
          ABIGOS_FR <i>//</i> {SITE.version}
        </span>
        <span className="intro__corner is-tr">
          © {SITE.year} LUCAS LOPES <i>//</i> POA 30°01′S
        </span>
        <span className="intro__corner is-bl">
          {ready ? (
            <>
              <b className="intro__dot" /> ACERVO PRONTO · 18 PEÇAS
            </>
          ) : (
            <>
              <b className="intro__dot is-busy" /> CARREGANDO ACERVO {pct}%
            </>
          )}
        </span>
        <span className="intro__corner is-br">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path d="M4 14v-2a8 8 0 0 1 16 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <rect x="3" y="13" width="4" height="7" rx="1" fill="currentColor" />
            <rect x="17" y="13" width="4" height="7" rx="1" fill="currentColor" />
          </svg>
          EXPERIÊNCIA COM SOM
        </span>
      </div>

      {phase === 'title' || phase === 'boot' ? (
        <div className="intro__prompt" style={promptStyle}>
          <button type="button" className={`intro__press t-mono ${ready ? 'is-ready' : ''}`} onClick={() => begin()} disabled={!ready}>
            {ready ? (isTouch ? 'Toque para acessar' : 'Aperte qualquer botão para acessar') : 'Carregando acervo…'}
          </button>
          {ready && (
            <button type="button" data-intro-option className="intro__silent t-mono" onClick={() => begin(true)}>
              ou entre em silêncio
            </button>
          )}
        </div>
      ) : null}

      {phase === 'hacking' || leaving ? <HackingScreen onDone={finishHacking} /> : null}
    </div>
  );
}
