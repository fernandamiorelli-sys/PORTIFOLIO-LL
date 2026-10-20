import { useEffect, useRef, useState } from 'react';
import { PIECES, ROOMS, type Match, type Piece, type RoomId } from '../../data/pieces';
import { calangoBus } from '../../lib/calangoBus';
import { hasMedia } from '../../lib/media';
import { gsap, scrollToTarget, ScrollTrigger } from '../../lib/scroll';
import { experience, reducedMotion } from '../../lib/store';
import { PieceCard } from '../piece/PieceCard';
import { Picture } from '../piece/Picture';
import { Resolve } from '../type/Resolve';
import { RoomIntro } from './RoomIntro';
import './rooms.css';

const roomOf = (id: RoomId) => ROOMS.find((r) => r.id === id)!;
const piecesOf = (id: RoomId) => PIECES.filter((p) => p.room === id && hasMedia(p.media) && !p.pending);

function useRoomLabel(ref: React.RefObject<HTMLElement | null>, label: string) {
  useEffect(() => {
    const st = ScrollTrigger.create({
      trigger: ref.current,
      start: 'top 55%',
      end: 'bottom 45%',
      onToggle: (self) => self.isActive && experience.set({ room: label }),
    });
    return () => st.kill();
  }, [ref, label]);
}

// ───────────────────────────── SALA 02 · REFORÇOS
// O reforço só é oficial quando o nome sai no BID, o Boletim Informativo Diário.
// Cada anúncio é um registro do boletim, e o carimbo bate quando a ficha entra na tela.

function BidEntry({ piece, index }: { piece: Piece; index: number }) {
  const ref = useRef<HTMLLIElement>(null);
  const [stamped, setStamped] = useState(reducedMotion);
  const s = piece.signing;

  useEffect(() => {
    const el = ref.current;
    if (!el || stamped) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        window.setTimeout(() => setStamped(true), 450);
      },
      { threshold: 0.55 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [stamped]);

  if (!s) return null;
  const open = () => experience.set({ sheet: piece.id });
  return (
    <li ref={ref} className={`bid-entry ${index % 2 ? 'is-flip' : ''} ${stamped ? 'is-stamped' : ''}`}>
      <div className="bid-entry__poster">
        <PieceCard piece={piece} label={false} sizes="(max-width: 900px) 92vw, 40vw" />
      </div>
      <div className="bid-entry__record">
        <p className="bid-entry__reg t-mono">
          <span>Registro nº {String(index + 1).padStart(3, '0')}/2026</span>
          <i aria-hidden="true" />
          <span>Nº da peça {piece.n}</span>
        </p>
        <p className="bid-entry__hello t-serif">Bem-vindo,</p>
        <h3 className="bid-entry__name t-display">
          <Resolve text={s.athlete} upper />
        </h3>
        <dl className="bid-entry__fields t-mono">
          {s.fields.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <i aria-hidden="true" />
              <dd>{v}</dd>
            </div>
          ))}
          <div>
            <dt>Anúncio</dt>
            <i aria-hidden="true" />
            <dd>{piece.title}</dd>
          </div>
        </dl>
        <p className="bid-entry__lead t-body">{piece.lead}</p>
        <button type="button" className="bid-entry__more t-mono" onClick={open} data-cursor="Ver processo">
          Ver processo <span aria-hidden="true">+</span>
        </button>
        <span className="bid-entry__stamp t-mono" aria-hidden="true">
          <b>Regularizado</b>
          <small>Abigos FR · 2026</small>
        </span>
        <span className="sr-only">{stamped ? 'Registro regularizado.' : ''}</span>
        <div className="bid-entry__anchor" data-calango={`bid-${piece.id}`} data-calango-size="0.085" data-calango-size-m="0.06" data-calango-tilt="42" data-calango-wander="0.7" aria-hidden="true" />
      </div>
    </li>
  );
}

export function Reforcos() {
  const room = roomOf('reforcos');
  const pieces = piecesOf('reforcos');
  const ref = useRef<HTMLElement>(null);
  useRoomLabel(ref, 'Sala 02 — Reforços');
  if (!pieces.length) return null;
  return (
    <section ref={ref} className="room room--reforcos" aria-label="Sala 02, Reforços">
      <RoomIntro room={room} count={pieces.length} />
      <div className="bid">
        <header className="bid__mast t-mono">
          <span className="bid__mast-name">
            <b>BID</b> Boletim Informativo Diário
          </span>
          <span>Abigos FR · temporada 2026</span>
          <span>
            {String(pieces.length).padStart(2, '0')} {pieces.length === 1 ? 'registro' : 'registros'}
          </span>
        </header>
        <ol className="bid__list">
          {pieces.map((p, i) => (
            <BidEntry key={p.id} piece={p} index={i} />
          ))}
        </ol>
      </div>
    </section>
  );
}

// ───────────────────────────── SALA 03 · CONFRONTOS
// "Próximas partidas": o painel de LED da estação. Partida é jogo e é embarque.

const YEAR = 2026;

/** situação de embarque, pela data do jogo (horário de Porto Alegre) */
function status(m: Match | undefined, now: Date) {
  if (!m?.date) return 'A CONFIRMAR';
  const [d, mo] = m.date.split('/').map(Number);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
  const day = `${YEAR}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (day < today) return 'PARTIU';
  if (day === today) return 'EMBARQUE';
  return 'NO HORÁRIO';
}

const destination = (m?: Match) => (!m ? 'ABIGOS FR' : m.versus === 'JOGO-TREINO' ? 'JOGO-TREINO' : m.versus);

function useNow(ms = 10000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

/** Painel de LED: linhas de partida, a da vez acesa, e o letreiro corrido da próxima estação. */
function Board({ pieces, active, onPick }: { pieces: Piece[]; active: number; onPick: (i: number, go?: boolean) => void }) {
  const now = useNow();
  const clock = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(now);
  const m = pieces[active]?.match;
  const ticker = m
    ? [
        `PRÓXIMA ESTAÇÃO: ${destination(m)} →`,
        m.versus === 'JOGO-TREINO' ? 'ABIGOS FR · JOGO-TREINO' : `ABIGOS FR × ${m.versus}`,
        [m.date, m.day, m.time].filter(Boolean).join(' · '),
        m.place ? `PLATAFORMA ${m.place}` : null,
      ]
        .filter(Boolean)
        .join('   ·   ')
    : '';
  return (
    <div className="led">
      <div className="led__head">
        <span className="led__title t-led">Próximas partidas</span>
        <span className="led__clock t-led" aria-label={`Horário de Porto Alegre: ${clock}`}>
          {clock}
        </span>
      </div>
      <div className="led__table" role="table" aria-label="Próximas partidas do Abigos FR">
        <div className="led__cols t-mono" role="row">
          <span role="columnheader">Data</span>
          <span role="columnheader">Hora</span>
          <span role="columnheader">Destino</span>
          <span role="columnheader" className="led__place">
            Plataforma
          </span>
          <span role="columnheader">Situação</span>
        </div>
        {pieces.map((p, i) => {
          const pm = p.match;
          return (
            // o mouse acende a linha (o teclado chega pelos pôsteres, que fazem o mesmo)
            <div key={p.id} role="row" className={`led__row t-led ${i === active ? 'is-on' : ''}`} onClick={() => onPick(i, true)} onPointerEnter={() => onPick(i)} data-cursor="Embarcar">
              <span role="cell">{pm?.date ?? '--/--'}</span>
              <span role="cell">{pm?.time ?? '--'}</span>
              <span role="cell" className="led__dest">
                {destination(pm)}
              </span>
              <span role="cell" className="led__place">
                {pm?.place ?? '—'}
              </span>
              <span role="cell" className="led__status">
                {status(pm, now)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="led__ticker t-led" aria-hidden="true">
        <div key={active} className="led__ticker-run">
          <span>{ticker}&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;</span>
          <span>{ticker}&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;</span>
        </div>
      </div>
    </div>
  );
}

export function Confrontos() {
  const room = roomOf('confrontos');
  const pieces = piecesOf('confrontos');
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  useRoomLabel(ref, 'Sala 03 — Confrontos');

  useEffect(() => {
    const items = ref.current?.querySelectorAll<HTMLElement>('.confrontos__poster');
    if (!items) return;
    const triggers = Array.from(items).map((el, i) =>
      ScrollTrigger.create({
        trigger: el,
        start: 'top 60%',
        end: 'bottom 40%',
        onToggle: (self) => self.isActive && setActive(i),
      }),
    );
    return () => triggers.forEach((t) => t.kill());
  }, [pieces.length]);

  // passar o mouse numa linha acende a partida; clicar leva até o pôster dela
  const pick = (i: number, go = false) => {
    setActive(i);
    const el = ref.current?.querySelectorAll<HTMLElement>('.confrontos__poster')[i];
    if (go && el) scrollToTarget(el, -window.innerHeight * 0.18);
  };

  if (!pieces.length) return null;

  return (
    <section ref={ref} className="room room--confrontos" aria-label="Sala 03, Confrontos">
      <RoomIntro room={room} count={pieces.length} />
      <div className="confrontos">
        <aside className="confrontos__board">
          <div className="confrontos__board-sticky">
            <Board pieces={pieces} active={active} onPick={pick} />
            <div className="confrontos__anchor" data-calango="confrontos" data-calango-size="0.1" data-calango-size-m="0.07" data-calango-tilt="40" data-calango-wander="0.8" aria-hidden="true" />
          </div>
        </aside>
        <div className="confrontos__posters">
          {pieces.map((p, i) => (
            <div key={p.id} className={`confrontos__poster ${i === active ? 'is-active' : ''}`} onPointerEnter={() => setActive(i)} onFocus={() => setActive(i)}>
              <p className="confrontos__plat t-mono" aria-hidden="true">
                <span>Plataforma {i + 1}</span>
                <span>{p.match?.date}</span>
              </p>
              <PieceCard piece={p} sizes="(max-width: 760px) 90vw, 44vw" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────── SALA 04 · IDENTIDADE
export function Identidade() {
  const room = roomOf('identidade');
  const pieces = piecesOf('identidade');
  const essencial = pieces.find((p) => p.id === 'essencial');
  const acervo = pieces.find((p) => p.id === 'acervo');
  const ref = useRef<HTMLElement>(null);
  const vitrineRef = useRef<HTMLDivElement>(null);
  const [home, setHome] = useState(false);
  useRoomLabel(ref, 'Sala 04 — Identidade');

  useEffect(() => {
    const el = vitrineRef.current;
    if (!el) return;
    // o calango chega ao patch e se "imprime" de volta na camisa Casa
    const st = ScrollTrigger.create({
      trigger: el,
      start: 'center 58%',
      end: 'center 36%',
      scrub: true,
      onUpdate: (self) => (calangoBus.vanish = self.progress),
      onLeaveBack: () => (calangoBus.vanish = 0),
    });
    // a legenda muda quando o calango de fato chega (o palco 3D informa)
    const onTick = () => setHome((h) => (h ? calangoBus.landed > 0.4 : calangoBus.landed > 0.97));
    gsap.ticker.add(onTick);
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--gx', `${((e.clientX - r.left) / r.width) * 100}%`);
      el.style.setProperty('--gy', `${((e.clientY - r.top) / r.height) * 100}%`);
    };
    el.addEventListener('pointermove', onMove);
    return () => {
      st.kill();
      gsap.ticker.remove(onTick);
      el.removeEventListener('pointermove', onMove);
    };
  }, []);

  if (!acervo) return null;
  return (
    <section ref={ref} className="room room--identidade" aria-label="Sala 04, Identidade">
      <RoomIntro room={room} count={pieces.length} />
      <div className="identidade">
        {essencial && (
          <div className="identidade__side">
            <PieceCard piece={essencial} sizes="(max-width: 760px) 80vw, 24vw" />
          </div>
        )}
        <figure className="identidade__main">
          <div ref={vitrineRef} className={`vitrine ${home ? 'is-home' : ''}`}>
            <button type="button" className="vitrine__btn" onClick={() => experience.set({ sheet: acervo.id })} data-cursor="Ver processo" aria-label={`${acervo.title}: ver o processo criativo`}>
              <Picture slug={acervo.media} alt={acervo.alt} sizes="(max-width: 760px) 92vw, 46vw" className="vitrine__pic" />
            </button>
            <span className="vitrine__glass" aria-hidden="true" />
            <span className="vitrine__patch" data-calango="patch" data-calango-mode="home" data-calango-layer="front" aria-hidden="true" />
          </div>
          <figcaption className="identidade__cap">
            <p className="t-mono">
              <span>Nº {acervo.n}</span> {home ? 'O calango voltou para casa.' : 'Vitrine · camisa Casa'}
            </p>
            <h3 className="t-serif">{acervo.title}</h3>
            <p className="t-mono identidade__lead">{acervo.lead}</p>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
