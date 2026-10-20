import { useEffect, useRef } from 'react';
import './splitflap.css';

// Placar split-flap (estilo painel de aeroporto), adaptado do Split Flap Display do 21st.dev:
// mesma anatomia (meia-folha superior/inferior + folhas que viram), mas animada direto no DOM,
// com conjunto de caracteres em português e respeito a prefers-reduced-motion.

const CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZÁÂÃÇÉÊÍÓÔÕÚ0123456789/:·.-×+';

interface CellRefs {
  top: HTMLSpanElement;
  bottom: HTMLSpanElement;
  flapTop: HTMLSpanElement;
  flapBottom: HTMLSpanElement;
  current: string;
}

export function SplitFlap({ rows, columns = 22, flipMs = 46, stagger = 22, label }: { rows: string[]; columns?: number; flipMs?: number; stagger?: number; label: string }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const cells = useRef<CellRefs[][]>([]);
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const board = boardRef.current!;
    cells.current = Array.from(board.querySelectorAll<HTMLElement>('.flap-row')).map((row) =>
      Array.from(row.querySelectorAll<HTMLElement>('.flap')).map((cell) => ({
        top: cell.querySelector('.flap__top span') as HTMLSpanElement,
        bottom: cell.querySelector('.flap__bottom span') as HTMLSpanElement,
        flapTop: cell.querySelector('.flap__leaf-top span') as HTMLSpanElement,
        flapBottom: cell.querySelector('.flap__leaf-bottom span') as HTMLSpanElement,
        current: ' ',
      })),
    );
  }, [rows.length, columns]);

  useEffect(() => {
    const timers: number[] = [];
    rows.forEach((text, r) => {
      const target = text.toUpperCase().padEnd(columns, ' ').slice(0, columns);
      cells.current[r]?.forEach((cell, c) => {
        const goal = CHARS.includes(target[c]) ? target[c] : ' ';
        if (reduced) {
          cell.current = goal;
          cell.top.textContent = cell.bottom.textContent = goal;
          return;
        }
        const step = () => {
          if (cell.current === goal) return;
          const prev = cell.current;
          const next = CHARS[(CHARS.indexOf(prev) + 1) % CHARS.length];
          cell.current = next;
          cell.flapTop.textContent = prev;
          cell.flapBottom.textContent = next;
          cell.top.textContent = next;
          const leafTop = cell.flapTop.parentElement!;
          const leafBottom = cell.flapBottom.parentElement!;
          leafTop.animate([{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-90deg)' }], { duration: flipMs * 0.5, easing: 'ease-in', fill: 'forwards' });
          leafBottom
            .animate([{ transform: 'rotateX(90deg)' }, { transform: 'rotateX(0deg)' }], { duration: flipMs * 0.5, delay: flipMs * 0.5, easing: 'ease-out', fill: 'both' })
            .finished.then(() => (cell.bottom.textContent = next))
            .catch(() => {});
          timers.push(window.setTimeout(step, flipMs));
        };
        timers.push(window.setTimeout(step, c * stagger + r * stagger * 3));
      });
    });
    return () => timers.forEach(clearTimeout);
  }, [rows, columns, flipMs, stagger, reduced]);

  return (
    <div ref={boardRef} className="flapboard" role="img" aria-label={label}>
      {rows.map((_, r) => (
        <div key={r} className="flap-row">
          <i className="flap-row__led" aria-hidden="true" />
          {Array.from({ length: columns }, (_, c) => (
            <span key={c} className="flap" aria-hidden="true">
              <span className="flap__top">
                <span> </span>
              </span>
              <span className="flap__bottom">
                <span> </span>
              </span>
              <span className="flap__leaf-top">
                <span> </span>
              </span>
              <span className="flap__leaf-bottom">
                <span> </span>
              </span>
            </span>
          ))}
          <i className="flap-row__led" aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}
