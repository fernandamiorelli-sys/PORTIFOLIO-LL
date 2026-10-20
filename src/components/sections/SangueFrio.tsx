import { useEffect, useMemo, useRef, useState } from 'react';
import { PIECES, ROOMS, type Piece } from '../../data/pieces';
import { audio } from '../../lib/audio';
import { hasMedia } from '../../lib/media';
import { gsap, ScrollTrigger } from '../../lib/scroll';
import { experience, reducedMotion } from '../../lib/store';
import { PieceCard } from '../piece/PieceCard';
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
  root.style.setProperty('--fg', luminance(sky.bg) > 0.4 ? BREU : OSSO);
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

/** Sala de projeção do filme Alvi-Verde: toca mudo em loop; com som, a trilha do site abaixa. */
function Screening({ piece }: { piece: Piece }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [withSound, setWithSound] = useState(false);

  useEffect(() => {
    const v = videoRef.current!;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) void v.play().catch(() => {});
        else {
          v.pause();
          if (!v.muted) {
            v.muted = true;
            setWithSound(false);
            audio.duck(false);
          }
        }
      },
      { threshold: 0.35 },
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
    v.addEventListener('ended', onEnd);
    return () => {
      io.disconnect();
      v.removeEventListener('ended', onEnd);
    };
  }, []);

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
      <div className="screening__player">
        <video ref={videoRef} poster={`${piece.video!.base}-poster.jpg`} muted loop playsInline preload="metadata" aria-label={piece.alt}>
          <source src={`${piece.video!.base}.webm`} type="video/webm" />
          <source src={`${piece.video!.base}.mp4`} type="video/mp4" />
        </video>
        <button type="button" className="screening__sound t-mono" onClick={toggleSound} data-cursor={withSound ? 'Silenciar' : 'Ouvir'}>
          <span className={`screening__dot ${withSound ? 'is-on' : ''}`} aria-hidden="true" />
          {withSound ? 'Tirar o som' : 'Assistir com som'}
        </button>
      </div>
      <div className="screening__text">
        <p className="t-mono screening__k">
          Nº {piece.n} <span>·</span> Filme
        </p>
        <h3 id="screening-title" className="t-serif screening__title">
          {piece.title}
        </h3>
        <p className="screening__lead t-mono">{piece.lead}</p>
        {piece.process.map((p) => (
          <p key={p} className="t-body">
            {p}
          </p>
        ))}
        <ul className="screening__ficha t-mono">
          {piece.ficha.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
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
