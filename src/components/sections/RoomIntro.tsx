import { useEffect, useRef, type CSSProperties } from 'react';
import type { Room } from '../../data/pieces';
import { ScrollTrigger } from '../../lib/scroll';
import { reducedMotion } from '../../lib/store';
import './room.css';

/** Cabeçalho de sala: número, título em largura variável, texto curatorial e ficha da sala. */
export function RoomIntro({ room, count }: { room: Room; count: number }) {
  const ref = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (reducedMotion) return;
    const st = ScrollTrigger.create({
      trigger: ref.current,
      start: 'top 85%',
      end: 'top 15%',
      scrub: true,
      onUpdate: (self) => {
        const p = self.progress;
        if (titleRef.current) {
          titleRef.current.style.fontStretch = `${50 + p * 50}%`;
          titleRef.current.style.letterSpacing = `${(1 - p) * 0.06}em`;
        }
      },
    });
    return () => st.kill();
  }, []);

  return (
    <header ref={ref} className="room-intro" id={`sala-${room.id}`}>
      <div className="room-intro__n t-display" aria-hidden="true">
        {room.n}
      </div>
      <p className="room-intro__kicker t-mono">
        Sala {room.n} <span>—</span> {room.kicker} <span>—</span> {String(count).padStart(2, '0')} {count === 1 ? 'peça' : 'peças'}
      </p>
      <div className="room-intro__anchor" data-calango={`sala-${room.id}`} data-calango-size="0.12" data-calango-tilt="40" data-calango-wander="0.8" aria-hidden="true" />
      <h2 ref={titleRef} className="room-intro__title t-display" style={{ '--chars': room.title.length } as CSSProperties}>
        {room.title}
      </h2>
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
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}
