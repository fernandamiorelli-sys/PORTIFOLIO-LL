import { useRef, useState } from 'react';
import { Picture } from './Picture';

/** Antes e depois com divisória arrastável (mouse, toque e teclado). */
export function Compare({ before, after, labels }: { before: string; after: string; labels: [string, string] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const dragging = useRef(false);

  const fromEvent = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    setPos(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)));
  };

  return (
    <div
      ref={ref}
      className="compare"
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        fromEvent(e);
      }}
      onPointerMove={(e) => dragging.current && fromEvent(e)}
      onPointerUp={() => (dragging.current = false)}
      data-cursor="Arraste"
    >
      <Picture slug={after} alt={labels[1]} fit="contain" sizes="(max-width: 900px) 100vw, 60vw" className="compare__img" />
      <div className="compare__before" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <Picture slug={before} alt={labels[0]} fit="contain" sizes="(max-width: 900px) 100vw, 60vw" className="compare__img" />
      </div>
      <div
        className="compare__handle"
        style={{ left: `${pos}%` }}
        role="slider"
        tabIndex={0}
        aria-label="Comparar escudo original e escudo Sangue-Frio"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 5));
          if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 5));
        }}
      >
        <span aria-hidden="true">‹ ›</span>
      </div>
      <span className="compare__label is-left t-mono">{labels[0]}</span>
      <span className="compare__label is-right t-mono">{labels[1]}</span>
    </div>
  );
}
