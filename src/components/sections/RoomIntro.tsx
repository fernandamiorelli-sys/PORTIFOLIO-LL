import { useEffect, useRef, type CSSProperties } from 'react';
import { ROOMS, type Room } from '../../data/pieces';
import { ScrollTrigger } from '../../lib/scroll';
import { reducedMotion } from '../../lib/store';
import { charsOf, measureEm, positionsOf, Resolve, scrubResolve } from '../type/Resolve';
import { Corridor } from './Corridor';
import './room.css';

const BAND = 0.3;

/**
 * Entrada de sala. Antes dela, o corredor que vem da sala anterior (na primeira, a entrada). O nome da
 * sala ocupa a largura inteira e entra em foco conforme a pessoa chega: uma linha de leitura o atravessa
 * e, atrás dela, o bitmap vira serifa. Embaixo, o texto de parede e a ficha.
 */
export function RoomIntro({ room, count }: { room: Room; count: number }) {
  const ref = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const scanRef = useRef<HTMLSpanElement>(null);
  const title = room.title.toLocaleUpperCase('pt-BR');

  useEffect(() => {
    const el = titleRef.current;
    if (!el || reducedMotion) return;
    const chars = charsOf(el);
    let pos = positionsOf(chars);
    const seed = Number(room.n);
    const apply = (p: number) => {
      scrubResolve(chars, p, { positions: pos, band: BAND, seed });
      // a linha de leitura passa um pouco à frente do foco
      const x = (p - BAND * 0.35) / (0.72 * (1 - BAND));
      const scan = scanRef.current;
      if (scan) {
        scan.style.setProperty('--x', `${Math.min(1, Math.max(0, x)) * 100}%`);
        scan.style.opacity = String(x > 0 && x < 1.05 ? 1 : 0);
      }
    };
    const st = ScrollTrigger.create({
      trigger: el,
      start: 'top 95%',
      end: 'top 32%',
      onUpdate: (self) => apply(self.progress),
      onRefresh: (self) => {
        pos = positionsOf(chars);
        apply(self.progress);
      },
    });
    apply(st.progress);
    return () => st.kill();
  }, [room.n]);

  const plural = count === 1 ? 'peça' : 'peças';
  const prev = ROOMS[ROOMS.findIndex((r) => r.id === room.id) - 1];

  return (
    <header ref={ref} className={`room-intro room-intro--${room.id}`} id={`sala-${room.id}`}>
      <Corridor
        label={prev ? 'Corredor' : 'Entrada'}
        route={prev ? `${prev.n} → ${room.n}` : `Sala ${room.n}`}
        exit={prev ? `Saída · ${prev.title}` : 'Fim do manifesto'}
        items={[`${prev ? 'Próxima sala' : 'Entrada'} → ${room.n} ${room.title}`, `${String(count).padStart(2, '0')} ${plural}`, room.kicker, 'Abigos FR', 'Temporada 2026']}
      />
      <p className="room-intro__top t-mono">
        <span>Sala {room.n}</span>
        <i aria-hidden="true" />
        <span>
          {String(count).padStart(2, '0')} {plural}
        </span>
      </p>

      <h2 ref={titleRef} className="room-intro__title t-display" style={{ '--em': measureEm(title) } as CSSProperties}>
        <Resolve text={title} trigger="none" from={100} />
        <span ref={scanRef} className="room-intro__scan" aria-hidden="true" />
      </h2>

      <div className="room-intro__sub">
        <p className="room-intro__kicker t-serif">{room.kicker}</p>
      </div>

      <div className="room-intro__body">
        <div className="room-intro__text">
          {room.intro.map((p) => (
            <p key={p} className="t-body">
              {p}
            </p>
          ))}
        </div>
        {room.data && (
          <dl className="room-intro__data t-mono">
            {room.data.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <i aria-hidden="true" />
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </header>
  );
}
