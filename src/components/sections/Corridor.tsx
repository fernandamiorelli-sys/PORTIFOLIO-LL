import { useEffect, useRef } from 'react';
import { reducedMotion } from '../../lib/store';
import './corridor.css';

/**
 * Corredor entre as salas: um letreiro de pontos, como o painel de estação de Confrontos, anuncia a
 * próxima sala no vão entre uma e outra. O texto corre devagar só enquanto o corredor está à vista (uma
 * animação de CSS, que o compositor toca sem a página); com "reduzir movimento", fica parado.
 */
export function Corridor({ label, route, exit, items }: { label: string; route: string; exit: string; items: string[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion) return;
    const io = new IntersectionObserver(([e]) => el.classList.toggle('is-running', e.isIntersecting), { rootMargin: '10% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // o letreiro em duas cópias iguais: a animação anda uma cópia e recomeça sem emenda
  const line = items.map((t, i) => (
    <span key={i}>
      {t}
      <i>·</i>
    </span>
  ));
  return (
    <div ref={ref} className="corridor" aria-hidden="true">
      <p className="corridor__k t-mono">
        <span>
          {label} <b>{route}</b>
        </span>
        <span>{exit}</span>
      </p>
      <div className="corridor__band">
        <div className="corridor__track">
          {[0, 1].map((copy) => (
            <div key={copy} className="corridor__copy">
              {line}
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
