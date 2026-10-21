import { useEffect, useRef, useState } from 'react';
import { CALANGO_SILHOUETTE, CALANGO_VIEWBOX } from '../../assets/calango';
import { audio } from '../../lib/audio';
import { getLenis, gsap, scrollToTarget } from '../../lib/scroll';
import { experience, useExperience } from '../../lib/store';
import { ACERVO } from '../piece/PieceSheet';
import { charsOf, Resolve, runTo } from '../type/Resolve';
import './hud.css';

const INDEX = [
  { n: '00', label: 'O idealizador', target: '#idealizador' },
  { n: '··', label: 'Manifesto', target: '#manifesto' },
  { n: '01', label: 'Sangue-Frio', target: '#sala-sangue-frio' },
  { n: '02', label: 'Reforços', target: '#sala-reforcos' },
  { n: '03', label: 'Confrontos', target: '#sala-confrontos' },
  { n: '04', label: 'Identidade', target: '#sala-identidade' },
  // atalho para o acervo inteiro: abre a ficha da primeira peça, e dali as setas percorrem todas
  { n: '··', label: `Todas as peças · ${ACERVO.length}`, target: 'acervo' },
  { n: '··', label: 'Sobre', target: '#sobre' },
  { n: '··', label: 'Vamos trabalhar juntos', target: '#contato' },
];

function SoundToggle() {
  const muted = useExperience((s) => s.muted);
  const sound = useExperience((s) => s.sound);
  const bars = useRef<HTMLSpanElement[]>([]);
  useEffect(() => {
    const levels = new Array(4).fill(0);
    const shown = new Array(4).fill(-1);
    const tick = () => {
      audio.levels(levels);
      bars.current.forEach((b, i) => {
        const v = Math.round((0.15 + levels[i] * 0.85) * 1000) / 1000;
        if (b && v !== shown[i]) b.style.transform = `scaleY(${(shown[i] = v)})`;
      });
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, []);
  if (!sound) return null;
  return (
    <button type="button" className="hud__sound" onClick={() => audio.setMuted(!muted)} aria-pressed={!muted} aria-label={muted ? 'Ligar o som' : 'Desligar o som'}>
      <span className="hud__bars" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} ref={(el) => void (el && (bars.current[i] = el))} />
        ))}
      </span>
      <span>{muted ? 'Som off' : 'Som on'}</span>
    </button>
  );
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 10000);
    return () => window.clearInterval(t);
  }, []);
  const time = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(now);
  return <span>POA {time}</span>;
}

/** Item do índice: fora de foco (em bitmap) até o cursor ou o teclado chegar nele. */
function IndexItem({ n, label, onGo }: { n: string; label: string; onGo: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const cancel = useRef<() => void>(() => {});
  const to = (level: 0 | 70) => {
    cancel.current();
    cancel.current = runTo(charsOf(ref.current), level, { spread: 0.18, step: 0.035, jitter: 0 });
  };
  useEffect(() => () => cancel.current(), []);
  return (
    <button ref={ref} type="button" onClick={onGo} onPointerEnter={() => to(0)} onPointerLeave={() => to(70)} onFocus={() => to(0)} onBlur={() => to(70)}>
      <span className="t-mono">{n}</span>
      <Resolve className="index__label t-display" text={label} upper trigger="none" from={70} />
    </button>
  );
}

export function Hud() {
  const room = useExperience((s) => s.room);
  const sheet = useExperience((s) => s.sheet);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const railRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // só escreve quando muda: parado, o HUD não toca no DOM (cada escrita custa estilo e pintura)
    let pct = '';
    let rail = -1;
    const tick = () => {
      const p = getLenis()?.progress ?? 0;
      const next = String(Math.round(p * 100)).padStart(3, '0');
      if (next !== pct && pctRef.current) pctRef.current.textContent = pct = next;
      const r = Math.round(p * 2000) / 2000;
      if (r !== rail && railRef.current) railRef.current.style.transform = `scaleY(${(rail = r)})`;
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, []);

  useEffect(() => {
    if (!open) return;
    getLenis()?.stop();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      getLenis()?.start();
    };
  }, [open]);

  const go = (target: string) => {
    setOpen(false);
    if (target === 'acervo') {
      // a ficha devolve o foco a quem a abriu: que seja o botão do índice, que continua na tela
      menuRef.current?.focus();
      experience.set({ sheet: ACERVO[0].id });
    } else window.setTimeout(() => scrollToTarget(target, -20), 60);
  };

  return (
    <>
      <header className={`hud t-mono ${sheet ? 'is-hidden' : ''}`}>
        <a className="hud__brand" href="#idealizador" onClick={(e) => (e.preventDefault(), go('#idealizador'))}>
          <svg viewBox={`0 0 ${CALANGO_VIEWBOX.width} ${CALANGO_VIEWBOX.height}`} aria-hidden="true">
            <path d={CALANGO_SILHOUETTE} fill="currentColor" />
          </svg>
          <span>
            Tudo o que <em className="hud__nao">não</em> somos
          </span>
        </a>
        <div className="hud__right">
          <SoundToggle />
          <button ref={menuRef} type="button" className="hud__menu" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="hud-index">
            {open ? 'Fechar' : 'Índice'}
          </button>
        </div>
        <span className="hud__room" aria-live="polite">
          {room}
        </span>
        <span className="hud__meta">
          <Clock />
          <i>·</i>
          <span ref={pctRef}>000</span>%
        </span>
        <span className="hud__rail" aria-hidden="true">
          <span ref={railRef} />
        </span>
      </header>

      <nav id="hud-index" className={`index ${open ? 'is-open' : ''}`} aria-label="Índice da exposição" aria-hidden={!open} inert={!open} data-lenis-prevent>
        <p className="index__k t-mono">Índice da exposição</p>
        <ol>
          {INDEX.map((item) => (
            <li key={item.target}>
              <IndexItem n={item.n} label={item.label} onGo={() => go(item.target)} />
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
