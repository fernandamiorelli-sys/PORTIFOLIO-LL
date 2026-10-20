import { forwardRef } from 'react';
import type { Piece } from '../../data/pieces';
import { experience } from '../../lib/store';
import { PHASE_LABEL } from '../sections/dayCycle';
import { Picture } from './Picture';
import './card.css';

/** Peça na parede: imagem + etiqueta de museu. Abre a ficha da obra. */
export const PieceCard = forwardRef<HTMLDivElement, { piece: Piece; sizes?: string; showClock?: boolean; label?: boolean }>(function PieceCard(
  { piece, sizes = '(max-width: 760px) 80vw, 36vw', showClock, label = true },
  ref,
) {
  const open = () => experience.set({ sheet: piece.id });
  return (
    <article className="card" data-piece={piece.id}>
      <div ref={ref} className="card__inner">
        <button
          type="button"
          className="card__media"
          onClick={open}
          data-cursor="Ver processo"
          aria-label={`${piece.title}: ver o processo criativo`}
        >
          <Picture slug={piece.media} alt={piece.alt} sizes={sizes} className="card__pic" />
          <span className="card__frame" aria-hidden="true" />
        </button>
        {label ? (
        <div className="card__label">
          {piece.slug ? <p className="card__slug t-mono">{piece.slug}</p> : null}
          <p className="card__meta t-mono">
            <span>Nº {piece.n}</span>
            {showClock && piece.clock ? (
              <span>
                {piece.clock.time} · {PHASE_LABEL[piece.clock.phase]}
              </span>
            ) : null}
          </p>
          <h3 className="card__title t-serif">{piece.title}</h3>
          <p className="card__lead t-mono">{piece.lead}</p>
          <button type="button" className="card__more t-mono" onClick={open}>
            Ver processo <span aria-hidden="true">+</span>
          </button>
        </div>
        ) : null}
      </div>
    </article>
  );
});
