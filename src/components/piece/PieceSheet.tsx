import { useEffect, useMemo, useRef } from 'react';
import { PIECES, ROOMS } from '../../data/pieces';
import { SITE } from '../../data/site';
import { hasMedia } from '../../lib/media';
import { getLenis, gsap } from '../../lib/scroll';
import { experience, reducedMotion, useExperience } from '../../lib/store';
import { Compare } from './Compare';
import { Loupe } from './Loupe';
import { Resolve } from '../type/Resolve';
import { Picture } from './Picture';
import './sheet.css';

const VISIBLE = PIECES.filter((p) => hasMedia(p.media) && !p.pending);

/** Ficha da obra: imagem grande + processo criativo + ficha técnica. Esc fecha, setas navegam. */
export function PieceSheet() {
  const id = useExperience((s) => s.sheet);
  const piece = useMemo(() => VISIBLE.find((p) => p.id === id) ?? null, [id]);
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  const index = piece ? VISIBLE.indexOf(piece) : -1;
  const go = (d: number) => experience.set({ sheet: VISIBLE[(index + d + VISIBLE.length) % VISIBLE.length].id });
  const close = () => experience.set({ sheet: null });

  useEffect(() => {
    if (!piece) return;
    lastFocus.current = (document.activeElement as HTMLElement) ?? null;
    getLenis()?.stop();
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'Tab' && ref.current) {
        // mantém o foco dentro da ficha
        const f = ref.current.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece]);

  useEffect(() => {
    if (piece) return;
    getLenis()?.start();
    lastFocus.current?.focus?.({ preventScroll: true });
  }, [piece]);

  useEffect(() => {
    if (!piece || !ref.current || reducedMotion) return;
    const tl = gsap.timeline();
    tl.fromTo(ref.current.querySelector('.sheet__media'), { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', duration: 0.9, ease: 'expo.inOut' });
    tl.fromTo(ref.current.querySelectorAll('.sheet__text > *'), { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, stagger: 0.05, ease: 'expo.out' }, 0.35);
    return () => {
      tl.kill();
    };
  }, [piece]);

  if (!piece) return null;
  const room = ROOMS.find((r) => r.id === piece.room)!;

  return (
    <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div className="sheet__media">
        {piece.loupe ? (
          <Loupe slug={piece.media} alt={piece.alt} />
        ) : piece.compare ? (
          <Compare {...piece.compare} />
        ) : (
          <Picture slug={piece.media} alt={piece.alt} fit="contain" sizes="(max-width: 900px) 100vw, 60vw" className="sheet__pic" />
        )}
      </div>

      <div className="sheet__text" data-lenis-prevent>
        <p className="sheet__k t-mono">
          Sala {room.n} · {room.title} <span>/</span> Nº {piece.n}
        </p>
        {piece.slug ? <p className="sheet__slug t-mono">{piece.slug}</p> : null}
        <h2 id="sheet-title" className="sheet__title t-display">
          <Resolve key={piece.id} text={piece.title} upper trigger="mount" spread={0.5} step={0.06} />
        </h2>
        <p className="sheet__lead t-serif">{piece.lead}</p>
        {/* o processo é a voz do diretor sobre a peça: no roteiro, uma fala em off */}
        <div className="sheet__process">
          <p className="sheet__cue t-mono">
            {SITE.author} <span>(V.O.)</span>
          </p>
          {piece.process.map((p) => (
            <p key={p} className="sheet__line">
              {p}
            </p>
          ))}
        </div>
        <div className="sheet__ficha">
          <p className="sheet__label t-mono">Notas de produção</p>
          <ul className="t-mono">
            {piece.ficha.map((f) => (
              <li key={f}>{f}</li>
            ))}
            <li>Direção de arte: {SITE.author}</li>
          </ul>
        </div>
      </div>

      <nav className="sheet__nav t-mono" aria-label="Navegação do acervo">
        <button type="button" className="t-mono" onClick={() => go(-1)} aria-label="Peça anterior">
          ← Anterior
        </button>
        <span aria-hidden="true">
          {String(index + 1).padStart(2, '0')} / {String(VISIBLE.length).padStart(2, '0')}
        </span>
        <button type="button" className="t-mono" onClick={() => go(1)} aria-label="Próxima peça">
          Próxima →
        </button>
      </nav>
      <button ref={closeRef} type="button" className="sheet__close t-mono" onClick={close}>
        Fechar <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}
