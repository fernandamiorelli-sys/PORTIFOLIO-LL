import { useEffect, useRef, useState } from 'react';
import { AUDIO } from '../../data/site';
import { PIECES } from '../../data/pieces';
import { audio } from '../../lib/audio';
import { handoff } from '../../lib/handoff';
import { reducedMotion } from '../../lib/store';
import { AsciiCalango } from './asciiCalango';
import './hacking.css';

// A tela de "hackeando" dura exatamente o intervalo da música entre AUDIO.startAt e AUDIO.dropAt.
// Tudo é sincronizado pelo tempo da trilha, não por timers: se o áudio travar, a tela espera.

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

interface LogLine {
  at: number;
  text: string;
  tone?: 'ok' | 'hot';
}

function buildLog(): LogLine[] {
  const span = AUDIO.dropAt - AUDIO.startAt;
  const lines: LogLine[] = [
    { at: 0.0, text: '> iniciando protocolo SANGUE-FRIO' },
    { at: 0.18, text: '> handshake abigos.fr :: porta 2026 ......... OK', tone: 'ok' },
    { at: 0.36, text: '> contornando firewall [chave: 7ª série] .... OK', tone: 'ok' },
    { at: 0.55, text: '> montando /acervo' },
  ];
  const files = PIECES.map((p) => `${p.room}/${p.n}_${slug(p.title)}${p.video ? '.mp4' : '.jpg'}`);
  const start = 0.7;
  const end = span - 1.25;
  files.forEach((f, i) => lines.push({ at: start + ((end - start) * i) / files.length, text: `  decrypt ${f}` }));
  lines.push({ at: span - 1.1, text: '> verificando assinatura: LUCAS LOPES // DIRETOR DE ARTE', tone: 'ok' });
  lines.push({ at: span - 0.62, text: '> compilando calango.obj' });
  lines.push({ at: span - 0.05, text: '> ACESSO CONCEDIDO', tone: 'hot' });
  return lines;
}

const LOG = buildLog();
const GROUPS = [
  { id: 'sangue-frio', label: 'SANGUE-FRIO' },
  { id: 'reforcos', label: 'REFORÇOS' },
  { id: 'confrontos', label: 'CONFRONTOS' },
  { id: 'identidade', label: 'IDENTIDADE' },
] as const;

function hexRow(seed: number) {
  let s = '';
  let x = seed;
  for (let i = 0; i < 8; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    s += (x & 0xff).toString(16).padStart(2, '0').toUpperCase() + ' ';
  }
  return s.trim();
}

export function HackingScreen({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const [granted, setGranted] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ascii = new AsciiCalango(canvas);
    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      ascii.resize(rect.width, rect.height);
    };
    fit();
    window.addEventListener('resize', fit);

    const span = AUDIO.dropAt - AUDIO.startAt;
    let raf = 0;
    let lastUi = 0;
    const tick = (now: number) => {
      const t = Math.max(0, audio.time() - AUDIO.startAt);
      const k = Math.min(1, t / span);
      // a formação termina um pouco antes da virada, para o "ACESSO CONCEDIDO" respirar
      ascii.progress = reducedMotion ? 1 : Math.min(1, k / 0.9);
      ascii.draw(now);
      if (now - lastUi > 50) {
        lastUi = now;
        setElapsed(t);
      }
      if (k >= 1 && !doneRef.current) {
        doneRef.current = true;
        setGranted(true);
        handoff.asciiRect = canvas.getBoundingClientRect();
        handoff.asciiProgress = 1;
        window.setTimeout(onDone, 380);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
    };
  }, [onDone]);

  const span = AUDIO.dropAt - AUDIO.startAt;
  const k = Math.min(1, elapsed / span);
  const visible = LOG.filter((l) => l.at <= elapsed);
  const pct = Math.round(k * 100);
  const clock = (AUDIO.startAt + elapsed).toFixed(3).padStart(6, '0');

  return (
    <div ref={wrapRef} className={`hack ${granted ? 'is-granted' : ''}`} role="status" aria-live="polite">
      <span className="sr-only">{granted ? 'Acesso concedido.' : 'Descriptografando o acervo…'}</span>

      <div className="hack__log t-mono" aria-hidden="true">
        <div className="hack__log-head">
          <span>TERMINAL</span>
          <span>abigos.fr/acervo</span>
        </div>
        <ol>
          {visible.slice(-22).map((l) => (
            <li key={l.at + l.text} className={l.tone ? `is-${l.tone}` : undefined}>
              <span className="hack__ts">[{(AUDIO.startAt + l.at).toFixed(3).padStart(6, '0')}]</span> {l.text}
            </li>
          ))}
        </ol>
      </div>

      <div className="hack__core" aria-hidden="true">
        <canvas ref={canvasRef} className="hack__ascii" />
        <div className="hack__granted t-display">Acesso concedido</div>
      </div>

      <div className="hack__meta t-mono" aria-hidden="true">
        <div className="hack__pct t-display">{String(pct).padStart(3, '0')}</div>
        <div className="hack__pct-label">% descriptografado</div>
        <ul className="hack__groups">
          {GROUPS.map((g, i) => {
            const total = PIECES.filter((p) => p.room === g.id).length;
            const local = Math.max(0, Math.min(1, k * 4.2 - i * 0.95));
            const done = Math.round(local * total);
            return (
              <li key={g.id}>
                <span>{g.label}</span>
                <span className="hack__bar">
                  <span style={{ transform: `scaleX(${local})` }} />
                </span>
                <span>
                  {String(done).padStart(2, '0')}/{String(total).padStart(2, '0')}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="hack__hex">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i}>{hexRow(Math.floor(elapsed * 9) + i * 97)}</div>
          ))}
        </div>
      </div>

      <div className="hack__timeline t-mono" aria-hidden="true">
        <span>00:{String(AUDIO.startAt).padStart(2, '0')}</span>
        <span className="hack__track">
          <span style={{ transform: `scaleX(${k})` }} />
        </span>
        <span>00:{String(AUDIO.dropAt).padStart(2, '0')}</span>
        <span className="hack__clock">T+{clock}</span>
      </div>
    </div>
  );
}
