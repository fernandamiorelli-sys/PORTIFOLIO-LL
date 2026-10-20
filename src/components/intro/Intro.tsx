import { useCallback, useEffect, useRef, useState } from 'react';
import { SITE } from '../../data/site';
import { audio } from '../../lib/audio';
import { bestFormat, imageUrl, loadImage } from '../../lib/media';
import { experience, isTouch, reducedMotion, useExperience } from '../../lib/store';
import { DataField } from './dataField';
import { TitleRenderer, type Framing } from './glass';
import { HackingScreen } from './HackingScreen';
import { createScratchTexture } from './scratches';
import { drawGlassPrint, NAO, TITLE_CHARS, type PrintLayout } from './titleArt';
import './intro.css';

// Abertura: boot (desfoque de 1 s) → title screen (uma tela de vidro em 3/4) → hacking (0:09–0:14) → site.

const IGNORED_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape']);
const LADDER = [100, 70, 50, 35, 20, 0];

const FONTS = [
  '400 40px "Redaction"',
  'italic 400 40px "Redaction"',
  '400 40px "Redaction 20"',
  '400 40px "Redaction 35"',
  '400 40px "Redaction 50"',
  '400 40px "Redaction 70"',
  '400 40px "Redaction 100"',
  'italic 400 40px "Redaction 100"',
  '400 16px "Courier Prime"',
  '700 16px "Courier Prime"',
  'italic 400 16px "Courier Prime"',
  '800 40px "Doto Variable"',
];

const loadFonts = () => Promise.all(FONTS.map((f) => document.fonts.load(f).catch(() => null)));

async function preloadAll(onProgress: (k: number) => void) {
  const fmt = await bestFormat;
  const tasks: Promise<unknown>[] = [
    document.fonts.ready,
    loadFonts(),
    audio.preload(),
    loadImage(imageUrl('lucas-lopes-dono', 900, fmt)),
    loadImage(imageUrl('lucas-lopes-dono-pb', 900, fmt)).catch(() => null),
    // o calango de vidro do manifesto: malha, mapa de campo e o código do vidro
    import('../glass/asset').then((m) => m.loadGlassCalango()).catch(() => null),
    import('../glass/glassRenderer'),
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

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp01 = (k: number) => Math.max(0, Math.min(1, k));

/** O enquadramento em 3/4 se adapta ao formato da tela. */
function frame(aspect: number): { framing: Omit<Framing, 'focusUv'>; portrait: boolean } {
  if (aspect >= 0.95) {
    const k = clamp01((aspect - 1) / 0.8);
    return {
      portrait: false,
      framing: {
        fovY: lerp(44, 35, k),
        half: [1.6, 0.8],
        center: [lerp(0.42, 0.34, k), lerp(0.02, -0.02, k), -2.9],
        yaw: lerp(31, 35, k),
        pitch: 3,
        aperture: 0.032,
        depth: 0.04,
        active: [0.018, 0.035, 0.982, 0.965],
      },
    };
  }
  const k = clamp01((0.95 - aspect) / 0.45);
  return {
    portrait: true,
    framing: {
      fovY: lerp(46, 50, k),
      half: [0.62, 1.24],
      center: [lerp(0.02, -0.03, k), 0.0, lerp(-2.75, -2.95, k)],
      yaw: lerp(28, 26, k),
      pitch: 4,
      aperture: 0.028,
      depth: 0.03,
      active: [0.035, 0.018, 0.965, 0.982],
    },
  };
}

export function Intro({ onEnterSite }: { onEnterSite: () => void }) {
  const phase = useExperience((s) => s.phase);
  const loaded = useExperience((s) => s.loaded);
  const sound = useExperience((s) => s.sound);
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<TitleRenderer | null>(null);
  const promptRef = useRef('CARREGANDO ACERVO 000%');
  const dirtyRef = useRef(true);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const ready = loaded >= 1;

  // a chamada impressa no vidro acompanha o carregamento
  useEffect(() => {
    const next = ready ? (isTouch ? 'TOQUE PARA ACESSAR' : 'APERTE QUALQUER BOTÃO PARA ACESSAR') : `CARREGANDO ACERVO ${String(Math.round(loaded * 100)).padStart(3, '0')}%`;
    if (next !== promptRef.current) {
      promptRef.current = next;
      dirtyRef.current = true;
    }
  }, [loaded, ready]);

  // render loop da title screen
  useEffect(() => {
    // um canvas novo por montagem: duas instâncias nunca dividem o mesmo contexto WebGL
    const host = hostRef.current!;
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    let alive = true;
    let renderer: TitleRenderer;
    try {
      renderer = new TitleRenderer(canvas);
    } catch {
      host.classList.add('is-fallback');
      return () => canvas.remove();
    }
    rendererRef.current = renderer;
    renderer.autoLight = isTouch;
    const data = new DataField();
    const print = document.createElement('canvas');
    let crest: HTMLImageElement | null = null;
    let portrait = false;
    let layout: PrintLayout | null = null;
    let base: Omit<Framing, 'focusUv'> | null = null;
    let raf = 0;
    let last = performance.now();
    let orient = '';

    // cada letra do título com seu degrau; o "NÃO" já nasce em 100 e fica
    const levels = new Array(TITLE_CHARS).fill(100);
    const starts = levels.map((_, i) => 1.15 + (i / TITLE_CHARS) * 0.5 + Math.random() * 0.45);

    const big = Math.min(window.innerWidth, window.innerHeight) > 700 && (window.devicePixelRatio || 1) >= 1;

    const redraw = () => {
      if (!alive) return;
      const pw = portrait ? 1024 : big ? 4096 : 2048;
      const ph = portrait ? 2048 : big ? 2048 : 1024;
      layout = drawGlassPrint(print, { crest, width: pw, height: ph, portrait, levels, prompt: promptRef.current });
      renderer.upload('title', print);
      renderer.prompt = layout.prompt;
      if (base) renderer.setFraming({ ...base, focusUv: layout.focus });
      dirtyRef.current = false;
    };

    const layoutAll = () => {
      if (!alive) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      renderer.resize(w * dpr, h * dpr);
      const f = frame(w / h);
      portrait = f.portrait;
      base = f.framing;
      const o = portrait ? 'p' : 'l';
      if (o !== orient) {
        orient = o;
        data.resize(portrait ? 1024 : 2048, portrait ? 2048 : 1024, portrait);
        renderer.upload('scratch', createScratchTexture(portrait ? 1024 : 2048, portrait ? 2048 : 1024));
      }
      redraw();
    };

    (async () => {
      crest = await loadImage(`/media/img/escudo-oficial-${big ? 1024 : 512}.webp`).catch(() => loadImage(`/media/img/escudo-oficial-${big ? 1024 : 512}.png`).catch(() => null));
      await loadFonts();
      dirtyRef.current = true;
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
    let nextGlitch = performance.now() + 2600;
    const born = performance.now();
    const tick = (stamp: number) => {
      // o carimbo do rAF pode vir antes do performance.now() da montagem: nunca deixe dt negativo
      const now = Math.max(stamp, performance.now());
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
      last = now;
      const age = (now - born) / 1000;

      if (data.shouldDraw(now, portrait ? 24 : 30)) {
        data.draw(dt * 2, { loaded: experience.get().loaded, quiet: layout?.quiet ?? [0, 0, 0.4, 1], portrait });
        renderer.upload('data', data.canvas);
      }

      // o título resolve no vidro, letra a letra (com interferência)
      let changed = false;
      for (let i = 0; i < levels.length; i++) {
        if (NAO.has(i)) continue;
        const k = reducedMotion ? 99 : Math.floor((age - starts[i]) / 0.075);
        let lv = k < 0 ? 100 : LADDER[Math.min(LADDER.length - 1, k)];
        if (k >= 0 && k < LADDER.length - 1 && Math.random() < 0.02) lv = LADDER[Math.max(0, k - 1)];
        if (lv !== levels[i]) {
          levels[i] = lv;
          changed = true;
        }
      }
      if (changed || dirtyRef.current) redraw();

      if (!reducedMotion && now > nextGlitch && experience.get().phase === 'title') {
        renderer.glitch(0.3 + Math.random() * 0.45, 80 + Math.random() * 150);
        nextGlitch = now + 3000 + Math.random() * 4200;
      }
      renderer.power = clamp01((age - 0.35) / 0.5) * (age < 0.9 ? (Math.random() < 0.3 ? 0.4 : 1) : 1);
      renderer.reveal = clamp01((age - 0.9) / 0.6);
      const ph = experience.get().phase;
      renderer.promptOn = ph === 'title' && experience.get().loaded >= 1 ? (Math.floor(age / 0.7) % 2 ? 0.22 : 1) : 1;
      if (ph !== 'title' && ph !== 'boot') renderer.dolly = Math.min(1, renderer.dolly + dt / 1.1);
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
    const t = window.setTimeout(() => experience.get().phase === 'boot' && experience.set({ phase: 'title' }), reducedMotion ? 0 : 1000);
    return () => window.clearTimeout(t);
  }, []);

  const begin = useCallback(
    (silent = false) => {
      if (experience.get().phase !== 'title' || !ready) return;
      if (silent) audio.setMuted(true);
      void audio.start();
      rendererRef.current?.glitch(1.3, 460);
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

  // só em desenvolvimento: ?direto pula a abertura, para revisar as salas
  useEffect(() => {
    if (!import.meta.env.DEV || !new URLSearchParams(location.search).has('direto')) return;
    // depois do efeito do App, que cria o scroll suave e o trava durante a abertura
    const t = window.setTimeout(() => {
      audio.setMuted(true);
      finishHacking();
    }, 0);
    return () => window.clearTimeout(t);
  }, [finishHacking]);

  if (gone) return null;

  const pct = String(Math.round(loaded * 100)).padStart(3, '0');

  return (
    <div className={`intro phase-${phase} ${leaving ? 'is-leaving' : ''}`}>
      <div ref={hostRef} className="intro__glass" aria-hidden="true" />

      <h1 className="sr-only">
        {SITE.title} — {SITE.club}, uma exposição de {SITE.author}
      </h1>

      <div className="intro__hud t-mono" aria-hidden="true">
        <span className="intro__corner is-tl">
          <b className="intro__rec" /> ABIGOS_FR <i>//</i> {SITE.version}
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
              <b className="intro__dot is-busy" /> CARREGANDO {pct}%
            </>
          )}
        </span>
        <span className="intro__corner is-br" hidden={!sound}>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path d="M4 14v-2a8 8 0 0 1 16 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <rect x="3" y="13" width="4" height="7" rx="1" fill="currentColor" />
            <rect x="17" y="13" width="4" height="7" rx="1" fill="currentColor" />
          </svg>
          EXPERIÊNCIA COM SOM
        </span>
      </div>

      {phase === 'title' || phase === 'boot' ? (
        <div className="intro__prompt">
          {/* a chamada visível está impressa no vidro; este botão é a versão acessível dela */}
          <button type="button" className="intro__press sr-only" onClick={() => begin()} disabled={!ready}>
            {ready ? (isTouch ? 'Toque para acessar' : 'Aperte qualquer botão para acessar') : 'Carregando acervo…'}
          </button>
          {ready && sound && (
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
