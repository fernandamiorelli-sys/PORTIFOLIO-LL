import { memo, useEffect, useRef, useState } from 'react';
import { MANIFESTO, PIECES } from '../../data/pieces';
import { calangoBus } from '../../lib/calangoBus';
import { hasMedia, imageUrl } from '../../lib/media';
import { ScrollTrigger } from '../../lib/scroll';
import { reducedMotion } from '../../lib/store';
import { charsOf, Resolve, restOf, runTo, type Level } from '../type/Resolve';
import './manifesto.css';

// Referência: kinoria.studio (o objeto em cena, a frase gigante trocando a cada passo do scroll,
// flashes rápidos do acervo). Aqui, tudo o que "não somos" chega em baixa resolução e, quando passa,
// é tarjado como num documento sigiloso: sobra só o "não". A última frase é a única que entra em foco.

const FLASH_POOL = [...new Set(PIECES.filter((p) => hasMedia(p.media) && !p.pending).map((p) => p.media))];
const PHRASES = MANIFESTO.phrases;
const TRUTH = PHRASES.length - 1;
/** o que não somos fica degradado; o "não", no bitmap mais grosso */
const NOT_REST: Level = 50;
const mark = (p: string) => p.replace(/^(não)\b/i, '[[$1]]');

/** A frase da vez, gigante. Entra subindo a escada de resolução e sai descendo. */
const Big = memo(function Big({ text, on, truth }: { text: string; on: boolean; truth: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const chars = charsOf(ref.current);
    if (!chars.length) return;
    return on ? runTo(chars, restOf, { delay: 0.12, spread: truth ? 1.1 : 0.55, step: truth ? 0.11 : 0.06 }) : runTo(chars, 'off', { spread: 0.3, step: 0.035, jitter: 0 });
  }, [on, truth]);
  return (
    <p ref={ref} className={`mf-big t-display ${truth ? 'is-truth' : ''} ${on ? 'is-on' : ''} ${reducedMotion ? 'is-static' : ''}`}>
      <Resolve text={text} upper trigger="none" from="off" rest={truth ? 0 : NOT_REST} />
    </p>
  );
});

/** A frase que passou: desce para a pilha, em letra miúda, e é tarjada. Sobra o "não". */
const Struck = memo(function Struck({ text, on }: { text: string; on: boolean }) {
  const ref = useRef<HTMLLIElement>(null);
  const [redacted, setRedacted] = useState(false);
  useEffect(() => {
    ref.current?.querySelectorAll<HTMLElement>('.rz-word').forEach((w, i) => w.style.setProperty('--i', String(i)));
  }, []);
  useEffect(() => {
    const chars = charsOf(ref.current);
    const rest = (c: HTMLElement) => (restOf(c) === 100 ? 100 : 35);
    if (reducedMotion) {
      // sem animação: a linha aparece já tarjada
      chars.forEach((c) => (c.dataset.l = on ? String(rest(c)) : 'off'));
      setRedacted(on);
      return;
    }
    if (!on) {
      setRedacted(false);
      return runTo(chars, 'off', { spread: 0.2, step: 0.03, jitter: 0 });
    }
    return runTo(chars, rest, { delay: 0.35, spread: 0.4, step: 0.05, onDone: () => setRedacted(true) });
  }, [on]);
  return (
    <li ref={ref} className={`mf-struck ${on ? 'is-on' : ''} ${redacted ? 'is-redacted' : ''}`}>
      <Resolve text={text} upper split trigger="none" from="off" rest={35} className="mf-struck__t t-display" />
    </li>
  );
});

export function Manifesto() {
  const sectionRef = useRef<HTMLElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [about, setAbout] = useState(false);
  // a frase só entra quando a sala aparece (senão ela resolveria escondida, atrás da abertura)
  const [live, setLive] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    const section = sectionRef.current!;
    const total = PHRASES.length;
    const st = ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        const p = self.progress;
        const i = Math.min(total - 1, Math.floor(p * (total + 0.6)));
        if (i !== indexRef.current) {
          indexRef.current = i;
          setIndex(i);
        }
        setAbout(p > 0.86);
        section.style.setProperty('--p', p.toFixed(4));
      },
    });
    const seen = ScrollTrigger.create({
      trigger: section,
      start: 'top 45%',
      end: 'bottom 30%',
      onToggle: (self) => setLive(self.isActive),
    });
    return () => {
      st.kill();
      seen.kill();
    };
  }, []);

  // troca de frase: o calango responde com flexões e o acervo pisca (até 3 flashes, ≤ 3 por segundo)
  useEffect(() => {
    if (index > 0) calangoBus.cue += 1;
    const flash = flashRef.current;
    if (!flash || index === 0 || reducedMotion) return;
    const timers: number[] = [];
    const imgs = Array.from(flash.querySelectorAll('img'));
    for (let k = 0; k < 3; k++) {
      timers.push(
        window.setTimeout(() => {
          const img = imgs[(index * 3 + k) % imgs.length];
          img.classList.add('is-on');
          window.setTimeout(() => img.classList.remove('is-on'), 120);
        }, k * 340),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [index]);

  const truth = index === TRUTH;

  return (
    <section ref={sectionRef} className={`manifesto ${about ? 'is-about' : ''} ${truth ? 'is-truth' : ''}`} id="manifesto" aria-labelledby="manifesto-h">
      <div className="manifesto__sticky">
        <div ref={flashRef} className="manifesto__flash" aria-hidden="true">
          {FLASH_POOL.map((slug) => (
            <img key={slug} src={imageUrl(slug, 960, 'webp')} alt="" loading="lazy" decoding="async" />
          ))}
        </div>

        <div
          className="manifesto__anchor manifesto__anchor--main"
          data-calango="manifesto"
          data-calango-mode="stage"
          data-calango-size="0.19"
          data-calango-size-m="0.085"
          data-calango-tilt="50"
          data-calango-heading="270"
          data-calango-wander="0"
          aria-hidden="true"
        />
        <div
          className="manifesto__anchor manifesto__anchor--about"
          data-calango="manifesto-clube"
          data-calango-mode="stage"
          data-calango-size="0.13"
          data-calango-size-m="0.06"
          data-calango-tilt="46"
          data-calango-heading="225"
          data-calango-heading-m="270"
          data-calango-wander="0.3"
          aria-hidden="true"
        />

        <h2 id="manifesto-h" className="sr-only">
          Manifesto
        </h2>
        <ol className="sr-only">
          {PHRASES.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>

        <header className="manifesto__bar t-mono" aria-hidden="true">
          <span>
            Manifesto <i>·</i> Documento nº 001
          </span>
          <span className="manifesto__bar-mid">{truth ? 'Desclassificado' : 'Sigiloso'}</span>
          <span>
            <b>{String(index + 1).padStart(2, '0')}</b> / {String(PHRASES.length).padStart(2, '0')}
          </span>
        </header>

        <ol className="manifesto__stack" aria-hidden="true">
          {PHRASES.slice(0, TRUTH).map((p, i) => (
            <Struck key={p} text={mark(p)} on={index > i} />
          ))}
        </ol>

        <div className="manifesto__stage" aria-hidden="true">
          {PHRASES.map((p, i) => (
            <Big key={p} text={i < TRUTH ? mark(p) : p} on={live && i === index} truth={i === TRUTH} />
          ))}
        </div>

        <div className="manifesto__about">
          <p className="t-mono manifesto__about-k">
            Abigos FR <i>·</i> Porto Alegre <i>·</i> fundado em 2026
          </p>
          {MANIFESTO.about.map((p) => (
            <p key={p} className="t-body">
              {p}
            </p>
          ))}
        </div>

        <div className="manifesto__rail" aria-hidden="true">
          {PHRASES.map((_, i) => (
            <span key={i} className={i <= index ? 'is-on' : undefined} />
          ))}
        </div>
      </div>
    </section>
  );
}
