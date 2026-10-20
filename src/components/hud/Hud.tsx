import { useEffect, useRef, useState } from 'react';
import { CALANGO_SILHOUETTE, CALANGO_VIEWBOX } from '../../assets/calango';
import { audio } from '../../lib/audio';
import { getLenis, gsap, scrollToTarget } from '../../lib/scroll';
import { useExperience } from '../../lib/store';
import './hud.css';

const INDEX = [
  { n: '00', label: 'O idealizador', target: '#idealizador' },
  { n: '··', label: 'Manifesto', target: '#manifesto' },
  { n: '01', label: 'Sangue-Frio', target: '#sala-sangue-frio' },
  { n: '02', label: 'Reforços', target: '#sala-reforcos' },
  { n: '03', label: 'Confrontos', target: '#sala-confrontos' },
  { n: '04', label: 'Identidade', target: '#sala-identidade' },
  { n: '··', label: 'Sobre', target: '#sobre' },
  { n: '··', label: 'Vamos trabalhar juntos', target: '#contato' },
];

function SoundToggle() {
  const muted = useExperience((s) => s.muted);
  const bars = useRef<HTMLSpanElement[]>([]);
  useEffect(() => {
    const levels = new Array(4).fill(0);
    const tick = () => {
      audio.levels(levels);
      bars.current.forEach((b, i) => {
        if (b) b.style.transform = `scaleY(${0.15 + levels[i] * 0.85})`;
      });
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, []);
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

export function Hud() {
  const room = useExperience((s) => s.room);
  const sheet = useExperience((s) => s.sheet);
  const [open, setOpen] = useState(false);
  const pctRef = useRef<HTMLSpanElement>(null);
  const railRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const tick = () => {
      const p = getLenis()?.progress ?? 0;
      if (pctRef.current) pctRef.current.textContent = String(Math.round(p * 100)).padStart(3, '0');
      if (railRef.current) railRef.current.style.transform = `scaleY(${p})`;
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
    window.setTimeout(() => scrollToTarget(target, -20), 60);
  };

  return (
    <>
      <header className={`hud t-mono ${sheet ? 'is-hidden' : ''}`}>
        <a className="hud__brand" href="#idealizador" onClick={(e) => (e.preventDefault(), go('#idealizador'))}>
          <svg viewBox={`0 0 ${CALANGO_VIEWBOX.width} ${CALANGO_VIEWBOX.height}`} aria-hidden="true">
            <path d={CALANGO_SILHOUETTE} fill="currentColor" />
          </svg>
          <span>Tudo o que não somos</span>
        </a>
        <div className="hud__right">
          <SoundToggle />
          <button type="button" className="hud__menu" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="hud-index">
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

      <nav id="hud-index" className={`index ${open ? 'is-open' : ''}`} aria-label="Índice da exposição" aria-hidden={!open} inert={!open}>
        <p className="index__k t-mono">Índice da exposição</p>
        <ol>
          {INDEX.map((item) => (
            <li key={item.target}>
              <button type="button" onClick={() => go(item.target)}>
                <span className="t-mono">{item.n}</span>
                <span className="index__label t-display">{item.label}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
