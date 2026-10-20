import { memo, useEffect, useRef, useState } from 'react';
import { MANIFESTO, PIECES } from '../../data/pieces';
import { hasMedia, imageUrl } from '../../lib/media';
import { getLenis, gsap, ScrollTrigger, setScrollGate } from '../../lib/scroll';
import { experience, isTouch, reducedMotion } from '../../lib/store';
import { GlassCalango, type GlassPlace } from '../glass/GlassCalango';
import { charsOf, Resolve, restOf, runTo, type Level } from '../type/Resolve';
import './manifesto.css';

// Referência: kinoria.studio (o objeto em cena, a frase gigante trocando, flashes rápidos do acervo).
// Tudo o que "não somos" chega em baixa resolução e, quando passa, é tarjado como num documento
// sigiloso: sobra só o "não". A última frase é a única que entra em foco.
//
// Ritmo: ao chegar aqui, a página para (só para baixo, e só na primeira vez) e as frases passam
// sozinhas, no tempo de leitura. Quem rola para cima sai e pode voltar; a contagem continua de onde parou.

const FLASH_POOL = [...new Set(PIECES.filter((p) => hasMedia(p.media) && !p.pending).map((p) => p.media))];
const PHRASES = MANIFESTO.phrases;
const TRUTH = PHRASES.length - 1;
/** segundos de cada frase do que não somos; a última fica um pouco mais antes de soltar a página */
const STEP = 2;
const TRUTH_HOLD = 2.8;
const DURATION = PHRASES.map((_, i) => (i < TRUTH ? STEP : TRUTH_HOLD));
/** o que não somos fica degradado; o "não", no bitmap mais grosso */
const NOT_REST: Level = 50;
const mark = (p: string) => p.replace(/^(não)\b/i, '[[$1]]');

// onde o calango de vidro fica: pousado no fim da frase da vez (cada frase termina num ponto,
// `text.ends`, fração da largura), invadindo as últimas letras; troca de frase, ele desliza junto.
// No texto do clube, vai para a direita e diminui. Na tela em pé a frase ocupa a largura toda: o
// calango fica logo abaixo dela (`text.bottom`, fração da altura), sem cobrir letra, e o quadro de
// dados não cruza o texto
interface TextBox {
  ends: number[];
  bottom: number;
}
const placeOf = (tall: boolean, about: boolean, index: number, text: TextBox): GlassPlace => {
  if (tall) {
    if (about) return { x: 0.74, y: 0.325, h: 0.18 };
    const top = text.bottom + 0.025;
    const h = Math.min(0.46, Math.max(0.3, 0.9 - top));
    return { x: 0.6, y: top + h / 2, h };
  }
  if (about) return { x: 0.8, y: 0.445, h: 0.55 };
  return { x: Math.min(0.62, Math.max(0.4, (text.ends[index] ?? 0.5) + 0.03)), y: 0.56, h: 0.74 };
};

/** a sequência já foi vista nesta visita (a trava não volta) */
let seen = false;

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
  const railRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(seen ? TRUTH : 0);
  // a primeira frase aparece quando o palco chega (senão resolveria escondida, atrás da abertura)
  const [live, setLive] = useState(false);
  const [done, setDone] = useState(seen);
  const [about, setAbout] = useState(false);
  const [tall, setTall] = useState(() => window.matchMedia('(max-aspect-ratio: 1/1)').matches);
  const [text, setText] = useState<TextBox>({ ends: [], bottom: 0.48 });

  useEffect(() => {
    const mq = window.matchMedia('(max-aspect-ratio: 1/1)');
    const on = () => setTall(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // onde as frases grandes terminam (o calango se encaixa ali em qualquer tela). A altura vem do
  // layout (offsetTop), que não sente o transform do estado do clube no celular
  useEffect(() => {
    const section = sectionRef.current!;
    const sticky = section.querySelector<HTMLElement>('.manifesto__sticky')!;
    const stage = section.querySelector<HTMLElement>('.manifesto__stage')!;
    const measure = () => {
      const box = sticky.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const round = (v: number) => Math.round(v * 100) / 100;
      const ends: number[] = [];
      let bottom = 0;
      section.querySelectorAll<HTMLElement>('.mf-big').forEach((p) => {
        // as linhas da frase visível (letra a letra ou, com movimento reduzido, texto corrido)
        let r = 0;
        const line = p.querySelector('span[aria-hidden]');
        for (const rect of line?.getClientRects() ?? []) r = Math.max(r, rect.right);
        ends.push(round((r - box.left) / box.width));
        bottom = Math.max(bottom, stage.offsetTop + p.offsetTop + p.offsetHeight);
      });
      const bot = round(bottom / box.height);
      setText((t) => (t.bottom === bot && t.ends.join() === ends.join() ? t : { ends, bottom: bot }));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(sticky);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, []);

  // o relógio das frases e o portão da rolagem
  useEffect(() => {
    const section = sectionRef.current!;
    const segs = Array.from(railRef.current?.querySelectorAll<HTMLElement>('.manifesto__rail i') ?? []);
    const s = { i: seen ? TRUTH : 0, t: 0, done: seen };
    const fill = () => segs.forEach((el, k) => (el.style.transform = `scaleX(${s.done || k < s.i ? 1 : k === s.i ? Math.min(1, s.t / DURATION[k]) : 0})`));
    const gate = () => setScrollGate(s.done ? null : section.getBoundingClientRect().top + window.scrollY);
    gate();
    fill();

    const tick = (_: number, dms: number) => {
      if (s.done) return;
      // o palco está preso na tela: o relógio anda (de cima, pelo portão; de baixo, livre). A conta usa
      // a rolagem do Lenis e os limites que o ScrollTrigger já mediu: ler a caixa da seção a cada quadro
      // forçaria o navegador a refazer o layout da página no meio do quadro, no site inteiro
      const y = getLenis()?.animatedScroll ?? 0;
      if (y < aboutTrig.start - 2 || y > aboutTrig.end + 2) return;
      // o tempo de verdade, mesmo num aparelho lento (só não pula de uma vez ao voltar de outra aba)
      s.t += Math.min(dms, 250) / 1000;
      if (s.t >= DURATION[s.i]) {
        if (s.i < TRUTH) {
          s.i += 1;
          s.t = 0;
          setIndex(s.i);
        } else {
          s.done = seen = true;
          setDone(true);
          setScrollGate(null);
        }
      }
      fill();
    };

    const seenTrig = ScrollTrigger.create({
      trigger: section,
      start: 'top 45%',
      end: 'bottom 30%',
      onToggle: (self) => setLive(self.isActive || s.done),
    });
    const label = ScrollTrigger.create({
      trigger: section,
      start: 'top 55%',
      end: 'bottom 45%',
      onToggle: (self) => self.isActive && experience.set({ room: 'Manifesto' }),
    });
    const aboutTrig = ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => setAbout(s.done && self.progress > 0.2),
      onRefresh: () => gate(),
    });
    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
      seenTrig.kill();
      label.kill();
      aboutTrig.kill();
      setScrollGate(null);
    };
  }, []);

  // troca de frase: o acervo pisca (até 3 flashes, com intervalo; nunca mais de 3 por segundo)
  useEffect(() => {
    const flash = flashRef.current;
    if (!flash || index === 0 || reducedMotion || (seen && done)) return;
    const timers: number[] = [];
    const imgs = Array.from(flash.querySelectorAll('img'));
    for (let k = 0; k < 3; k++) {
      timers.push(
        window.setTimeout(() => {
          const img = imgs[(index * 3 + k) % imgs.length];
          img.classList.add('is-on');
          timers.push(window.setTimeout(() => img.classList.remove('is-on'), 200));
        }, k * 400),
      );
    }
    return () => {
      timers.forEach(clearTimeout);
      imgs.forEach((img) => img.classList.remove('is-on'));
    };
  }, [index, done]);

  const truth = index === TRUTH;
  const place = placeOf(tall, about, index, text);

  return (
    <section
      ref={sectionRef}
      className={`manifesto ${about ? 'is-about' : ''} ${truth ? 'is-truth' : ''} ${done ? 'is-done' : ''}`}
      id="manifesto"
      aria-labelledby="manifesto-h"
    >
      <div className="manifesto__sticky">
        <div ref={flashRef} className="manifesto__flash" aria-hidden="true">
          {FLASH_POOL.map((slug) => (
            <img key={slug} src={imageUrl(slug, 960, 'webp')} alt="" loading="lazy" decoding="async" />
          ))}
        </div>

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

        <GlassCalango place={place} compact={about || tall} />

        <div ref={railRef} className="manifesto__rail" aria-hidden="true">
          <div className="manifesto__rail-segs">
            {PHRASES.map((_, i) => (
              <span key={i}>
                <i />
              </span>
            ))}
          </div>
          <p className="manifesto__next t-mono">
            {isTouch ? 'Deslize' : 'Role'} <b>↓</b>
          </p>
        </div>
      </div>
    </section>
  );
}
