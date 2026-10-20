import { useEffect, useMemo, useRef, useState } from 'react';
import { PIECES, ROOMS, type Piece, type RoomId } from '../../data/pieces';
import { calangoBus } from '../../lib/calangoBus';
import { hasMedia } from '../../lib/media';
import { gsap, ScrollTrigger } from '../../lib/scroll';
import { experience } from '../../lib/store';
import { PieceCard } from '../piece/PieceCard';
import { Picture } from '../piece/Picture';
import { SplitFlap } from '../piece/SplitFlap';
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
export function Reforcos() {
  const room = roomOf('reforcos');
  const pieces = piecesOf('reforcos');
  const ref = useRef<HTMLElement>(null);
  useRoomLabel(ref, 'Sala 02 — Reforços');
  if (!pieces.length) return null;
  return (
    <section ref={ref} className="room room--reforcos" aria-label="Sala 02, Reforços">
      <RoomIntro room={room} count={pieces.length} />
      <div className={`reforcos ${pieces.length === 1 ? 'is-single' : ''}`}>
        <div className="reforcos__anchor" data-calango="reforcos" data-calango-rot="18" data-calango-tilt="0.5" aria-hidden="true" />
        {pieces.map((p, i) => (
          <div key={p.id} className="reforcos__item">
            <p className="reforcos__tag t-mono" aria-hidden="true">
              <span>Reforço {String(i + 1).padStart(2, '0')}</span>
              <span>Temporada 2026</span>
              <span className="is-ok">Confirmado</span>
            </p>
            <PieceCard piece={p} sizes="(max-width: 760px) 90vw, 38vw" />
          </div>
        ))}
      </div>
    </section>
  );
}

// ───────────────────────────── SALA 03 · CONFRONTOS
function boardRows(p: Piece) {
  const m = p.match;
  if (!m) return ['ABIGOS FR', '', ''];
  const versus = m.versus === 'JOGO-TREINO' ? 'ABIGOS FR · JOGO-TREINO' : `ABIGOS FR × ${m.versus}`;
  const when = [m.date, m.day].filter(Boolean).join(' · ') || 'DATA A CONFIRMAR';
  const where = [m.time, m.place].filter(Boolean).join(' · ') || 'LOCAL A CONFIRMAR';
  return [versus, when, where];
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

  const rows = useMemo(() => (pieces[active] ? boardRows(pieces[active]) : ['', '', '']), [pieces, active]);
  if (!pieces.length) return null;

  return (
    <section ref={ref} className="room room--confrontos" aria-label="Sala 03, Confrontos">
      <RoomIntro room={room} count={pieces.length} />
      <div className="confrontos">
        <aside className="confrontos__board">
          <div className="confrontos__board-sticky">
            <p className="t-mono confrontos__board-k">
              Próximo confronto <span>·</span> {String(active + 1).padStart(2, '0')}/{String(pieces.length).padStart(2, '0')}
            </p>
            <SplitFlap rows={rows} columns={26} label={rows.filter(Boolean).join(', ')} />
            <div className="confrontos__anchor" data-calango="confrontos" data-calango-rot="-8" data-calango-tilt="0.4" aria-hidden="true" />
          </div>
        </aside>
        <div className="confrontos__posters">
          {pieces.map((p, i) => (
            <div key={p.id} className={`confrontos__poster ${i === active ? 'is-active' : ''}`} onPointerEnter={() => setActive(i)} onFocus={() => setActive(i)}>
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
            <span className="vitrine__patch" data-calango="patch" data-calango-layer="front" data-calango-tilt="0" data-calango-rot="0" aria-hidden="true" />
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
