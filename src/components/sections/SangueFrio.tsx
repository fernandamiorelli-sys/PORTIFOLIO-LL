import { useEffect, useMemo, useRef, useState } from 'react';
import { PIECES, ROOMS, type Piece } from '../../data/pieces';
import { audio } from '../../lib/audio';
import { hasMedia } from '../../lib/media';
import { gsap, ScrollTrigger } from '../../lib/scroll';
import { experience, reducedMotion } from '../../lib/store';
import { SITE } from '../../data/site';
import { PieceCard } from '../piece/PieceCard';
import { Resolve } from '../type/Resolve';
import { luminance, mixClock, mixSky, PHASE_LABEL, PRE, SKIES, type Sky } from './dayCycle';
import { RoomIntro } from './RoomIntro';
import './sangue-frio.css';

const ROOM = ROOMS.find((r) => r.id === 'sangue-frio')!;
const ALL = PIECES.filter((p) => p.room === 'sangue-frio' && hasMedia(p.media) && !p.pending);
const FILM = PIECES.find((p) => p.id === 'alvi-verde');

const OSSO = '#e8e3d7';
const BREU = '#070807';

function applySky(sky: Sky, sun: HTMLElement | null) {
  const root = document.documentElement;
  root.style.setProperty('--bg', sky.bg);
  // o texto escolhe o tom de maior contraste com o céu (o ponto de virada fica perto de L = 0,16)
  root.style.setProperty('--fg', luminance(sky.bg) > 0.16 ? BREU : OSSO);
  if (sun) {
    sun.style.setProperty('--sun', sky.sun);
    sun.style.opacity = String(sky.alpha);
    sun.style.width = `${sky.size}vh`;
    sun.style.transform = `translate(calc(${sky.x}vw - 50%), calc(${sky.y}vh - 50%))`;
  }
}

function resetSky() {
  const root = document.documentElement;
  root.style.setProperty('--bg', BREU);
  root.style.setProperty('--fg', OSSO);
}

const FPS = 24;
const pad = (n: number) => String(n).padStart(2, '0');
/** timecode de montagem: HH:MM:SS:QQ (quadros a 24 qps) */
const timecode = (t: number) => {
  const f = Math.floor(t * FPS);
  return `${pad(Math.floor(f / (FPS * 3600)))}:${pad(Math.floor(f / (FPS * 60)) % 60)}:${pad(Math.floor(f / FPS) % 60)}:${pad(f % FPS)}`;
};
const shortTc = (t: number) => `${pad(Math.floor(t / 60))}:${pad(Math.floor(t % 60))}`;

/**
 * Sala de projeção do filme Alvi-Verde. Ao lado da tela, a decupagem impressa (o roteiro de montagem):
 * o marca-texto acompanha o plano que está passando, e cada plano leva o filme até ele.
 * O filme toca mudo em loop; com som, a trilha do site abaixa.
 */
function Screening({ piece }: { piece: Piece }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const rollRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLSpanElement>(null);
  const tcRef = useRef<HTMLSpanElement>(null);
  const [withSound, setWithSound] = useState(false);
  const [duration, setDuration] = useState(26.5);
  const [shot, setShot] = useState(0);
  const shots = useMemo(() => piece.shots ?? [], [piece]);
  const scenes = useMemo(() => shots.map((s, i) => ({ ...s, i })).filter((s) => !s.cut), [shots]);

  useEffect(() => {
    const v = videoRef.current!;
    // timecode, cabeça de leitura e plano ativo, a cada quadro, só enquanto a sala está na tela
    let raf = 0;
    let last = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = v.currentTime;
      if (t === last) return;
      last = t;
      if (tcRef.current) tcRef.current.textContent = timecode(t);
      if (headRef.current) headRef.current.style.transform = `scaleX(${Math.min(1, t / (v.duration || 26.5))})`;
      let k = 0;
      for (let i = 0; i < shots.length; i++) if (shots[i].t <= t + 0.02) k = i;
      setShot(k);
    };
    const io = new IntersectionObserver(
      ([e]) => {
        cancelAnimationFrame(raf);
        if (e.isIntersecting) {
          void v.play().catch(() => {});
          raf = requestAnimationFrame(tick);
        } else {
          v.pause();
          if (!v.muted) {
            v.muted = true;
            setWithSound(false);
            audio.duck(false);
          }
        }
      },
      { threshold: 0.2 },
    );
    io.observe(v);
    const onEnd = () => {
      if (!v.muted) {
        v.muted = true;
        setWithSound(false);
        audio.duck(false);
        v.loop = true;
        void v.play().catch(() => {});
      }
    };
    const onMeta = () => Number.isFinite(v.duration) && v.duration > 0 && setDuration(v.duration);
    v.addEventListener('ended', onEnd);
    v.addEventListener('loadedmetadata', onMeta);
    onMeta();
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      v.removeEventListener('ended', onEnd);
      v.removeEventListener('loadedmetadata', onMeta);
    };
  }, [shots]);

  // o rolo do roteiro sobe para manter o plano da vez no terço de cima da página (só na tela larga)
  useEffect(() => {
    const page = pageRef.current;
    const roll = rollRef.current;
    if (!page || !roll) return;
    if (window.matchMedia('(max-width: 900px)').matches) {
      roll.style.transform = '';
      return;
    }
    const el = roll.querySelector<HTMLElement>(`[data-shot="${shot}"]`);
    if (!el) return;
    const max = Math.max(0, roll.scrollHeight - page.clientHeight);
    const y = Math.min(max, Math.max(0, el.offsetTop - page.clientHeight * 0.28));
    roll.style.transform = `translateY(${-y}px)`;
  }, [shot]);

  const seek = (t: number) => {
    const v = videoRef.current!;
    v.currentTime = Math.max(0, Math.min(t + 0.01, (v.duration || duration) - 0.05));
    if (v.paused) void v.play().catch(() => {});
  };

  const onTrack = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * duration);
  };

  const toggleSound = () => {
    const v = videoRef.current!;
    if (v.muted) {
      v.muted = false;
      v.loop = false;
      v.currentTime = 0;
      void v.play().catch(() => {});
      setWithSound(true);
      audio.duck(true);
    } else {
      v.muted = true;
      v.loop = true;
      setWithSound(false);
      audio.duck(false);
    }
  };

  return (
    <section className="screening" aria-labelledby="screening-title">
      <header className="screening__head t-mono">
        <span>
          Nº {piece.n} <i>·</i> Filme <i>·</i> {shortTc(duration)}
        </span>
        <span className="screening__live">
          <b aria-hidden="true" /> Projeção contínua
        </span>
      </header>

      <div className="screening__grid">
        <div className="screening__player">
          <video ref={videoRef} poster={`${piece.video!.base}-poster.jpg`} muted loop playsInline preload="metadata" aria-label={piece.alt}>
            <source src={`${piece.video!.base}.webm`} type="video/webm" />
            <source src={`${piece.video!.base}.mp4`} type="video/mp4" />
          </video>
        </div>

        <div className="screening__bar">
          <span ref={tcRef} className="screening__tc t-led" aria-hidden="true">
            00:00:00:00
          </span>
          <div className="screening__track" onClick={onTrack} data-cursor="Ir para" aria-hidden="true">
            {scenes.map((s) => (
              <i key={s.i} style={{ left: `${(s.t / duration) * 100}%` }} className={s.i === shot ? 'is-on' : undefined} />
            ))}
            <span ref={headRef} className="screening__head-bar" />
          </div>
          <button type="button" className="screening__sound t-mono" onClick={toggleSound} data-cursor={withSound ? 'Silenciar' : 'Ouvir'} aria-pressed={withSound}>
            <span className={`screening__dot ${withSound ? 'is-on' : ''}`} aria-hidden="true" />
            {withSound ? 'Tirar o som' : 'Assistir com som'}
          </button>
        </div>

        <div ref={pageRef} className="screening__page">
          <div ref={rollRef} className="screening__roll">
            <p className="sp-top">
              <span>{piece.title.toUpperCase()} — roteiro de montagem</span>
              <span>1.</span>
            </p>
            <p className="sp-cut is-in">FADE IN:</p>
            {shots.map((s, i) =>
              s.cut ? (
                <p key={i} data-shot={i} className={`sp-cut ${i === shot ? 'is-on' : ''}`}>
                  {s.cut}
                </p>
              ) : (
                <button key={i} type="button" data-shot={i} className={`sp-shot ${i === shot ? 'is-on' : ''}`} onClick={() => seek(s.t)} aria-label={`Ir para ${shortTc(s.t)}: ${s.slug}`}>
                  <span className="sp-slug">
                    <span>{s.slug}</span>
                    <span className="sp-tc">{shortTc(s.t)}</span>
                  </span>
                  <span className="sp-action">
                    <mark>{s.action}</mark>
                  </span>
                </button>
              ),
            )}
          </div>
        </div>
      </div>

      <div className="screening__text">
        <div className="screening__titles">
          <h3 id="screening-title" className="screening__title t-display">
            <Resolve text={piece.title} upper />
          </h3>
          <p className="screening__lead t-serif">{piece.lead}</p>
        </div>
        <div className="screening__vo">
          <p className="screening__cue t-mono">
            {SITE.author} <span>(V.O.)</span>
          </p>
          {piece.process.map((p) => (
            <p key={p} className="screening__line">
              {p}
            </p>
          ))}
        </div>
        <div className="screening__notes">
          <p className="t-mono screening__notes-k">Notas de produção</p>
          <ul className="t-mono">
            {piece.ficha.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Um dia no sertão: as peças entram pela lateral enquanto o céu muda. */
function DayGallery({ pieces }: { pieces: Piece[] }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const sunRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const phaseRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const outer = outerRef.current!;
    const track = trackRef.current!;
    const sun = sunRef.current;
    const travel = () => Math.max(0, track.scrollWidth - window.innerWidth);
    const size = () => {
      outer.style.height = `${travel() + window.innerHeight}px`;
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(track);

    let centers: number[] = [];
    const measure = () => {
      centers = Array.from(track.children).map((el) => {
        const e = el as HTMLElement;
        return e.offsetLeft + e.offsetWidth / 2;
      });
    };
    measure();

    const skies = pieces.map((p) => SKIES[p.clock?.phase ?? 'estudio']);
    const update = (x: number) => {
      // índice contínuo da peça no centro da tela
      const mid = -x + window.innerWidth / 2;
      let c = -0.6;
      if (centers.length) {
        const step = centers.length > 1 ? centers[1] - centers[0] : window.innerWidth;
        if (mid <= centers[0]) c = Math.max(-0.6, (mid - centers[0]) / step);
        else if (mid >= centers[centers.length - 1]) c = centers.length - 1;
        else
          for (let i = 0; i < centers.length - 1; i++)
            if (mid < centers[i + 1]) {
              c = i + (mid - centers[i]) / (centers[i + 1] - centers[i]);
              break;
            }
      }
      let sky: Sky;
      if (c < 0) sky = mixSky(PRE, skies[0], 1 + c / 0.6);
      else {
        const i = Math.floor(c);
        const t = c - i;
        sky = mixSky(skies[i], skies[Math.min(skies.length - 1, i + 1)], t);
      }
      applySky(sky, sun);
      const i = Math.max(0, Math.min(pieces.length - 1, Math.round(c)));
      const a = pieces[Math.max(0, Math.floor(c))];
      const b = pieces[Math.min(pieces.length - 1, Math.max(0, Math.floor(c)) + 1)];
      if (clockRef.current && a.clock && b.clock) clockRef.current.textContent = mixClock(a.clock.time, b.clock.time, Math.max(0, c - Math.floor(c)));
      if (phaseRef.current && pieces[i].clock) phaseRef.current.textContent = PHASE_LABEL[pieces[i].clock!.phase];
    };

    const ctx = gsap.context(() => {
      const horizontal = gsap.to(track, {
        x: () => -travel(),
        ease: 'none',
        scrollTrigger: {
          trigger: outer,
          start: 'top top',
          end: () => `+=${travel()}`,
          scrub: true,
          invalidateOnRefresh: true,
          onRefresh: () => measure(),
          onUpdate: (self) => {
            update(gsap.getProperty(track, 'x') as number);
            if (barRef.current) barRef.current.style.transform = `scaleX(${self.progress})`;
          },
          onEnter: () => experience.set({ room: 'Sala 01 — Sangue-Frio' }),
          onEnterBack: () => experience.set({ room: 'Sala 01 — Sangue-Frio' }),
          onLeave: () => resetSky(),
          onLeaveBack: () => resetSky(),
        },
      });

      // cada peça entra girando a partir da profundidade, assenta e sai inclinando
      const mobile = window.innerWidth < 760;
      cardRefs.current.forEach((card, i) => {
        if (!card) return;
        const offset = ((i % 3) - 1) * (mobile ? 2 : 6);
        const rIn = (mobile ? -55 : -88) * (reducedMotion ? 0.15 : 1);
        const rOut = (mobile ? 40 : 64) * (reducedMotion ? 0.15 : 1);
        gsap
          .timeline({
            scrollTrigger: {
              trigger: card.parentElement,
              containerAnimation: horizontal,
              start: 'left 100%',
              end: 'right 0%',
              scrub: true,
            },
          })
          .fromTo(card, { rotateY: rIn, rotateX: 4, y: `${offset}vh`, opacity: 0.5 }, { rotateY: 0, rotateX: 0, y: 0, opacity: 1, ease: 'none' })
          .to(card, { rotateY: rOut, y: `${-offset}vh`, opacity: 0.85, ease: 'none' });
      });
    }, outer);

    return () => {
      ro.disconnect();
      ctx.revert();
      resetSky();
    };
  }, [pieces]);

  return (
    <div ref={outerRef} className="day" aria-label="Um dia no sertão: peças da campanha Sangue-Frio">
      <div className="day__sticky">
        <div ref={sunRef} className="day__sun" aria-hidden="true" />
        <div className="day__ground" aria-hidden="true" />
        <p className="day__clock t-mono" aria-hidden="true">
          Hora solar <b ref={clockRef}>04:50</b> <i>·</i> <span ref={phaseRef}>Amanhecer</span>
        </p>
        <div ref={trackRef} className="day__track">
          {pieces.map((p, i) => (
            <div key={p.id} className="day__slot">
              <PieceCard ref={(el) => void (cardRefs.current[i] = el)} piece={p} showClock sizes="(max-width: 760px) 78vw, 34vw" />
            </div>
          ))}
        </div>
        <div className="day__walk" data-calango="sangue-frio" data-calango-size="0.1" data-calango-tilt="28" data-calango-heading="90" data-calango-wander="1.4" aria-hidden="true" />
        <div className="day__progress" aria-hidden="true">
          <span ref={barRef} />
        </div>
      </div>
    </div>
  );
}

export function SangueFrio() {
  const gallery = useMemo(() => ALL.filter((p) => !p.video), []);
  const film = FILM && FILM.video && !FILM.video.pending ? FILM : null;
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const st = ScrollTrigger.create({
      trigger: ref.current,
      start: 'top 60%',
      end: 'bottom 40%',
      onToggle: (self) => self.isActive && experience.set({ room: 'Sala 01 — Sangue-Frio' }),
    });
    return () => st.kill();
  }, []);

  return (
    <section ref={ref} className="room room--sangue-frio" aria-labelledby={`sala-${ROOM.id}-t`}>
      <span id={`sala-${ROOM.id}-t`} className="sr-only">
        Sala 01, Sangue-Frio
      </span>
      <RoomIntro room={ROOM} count={ALL.length} />
      {film ? <Screening piece={film} /> : null}
      <DayGallery pieces={gallery} />
    </section>
  );
}
