import { memo, useEffect, useRef, useState } from 'react';
import { MANIFESTO, PIECES } from '../../data/pieces';
import { hasMedia, imageUrl } from '../../lib/media';
import { gsap, ScrollTrigger, setSlowZone } from '../../lib/scroll';
import { experience, isTouch, reducedMotion } from '../../lib/store';
import { GlassCalango, type GlassPlace } from '../glass/GlassCalango';
import { charsOf, Resolve, restOf, runTo, type Level } from '../type/Resolve';
import './manifesto.css';

// Referência: kinoria.studio (o objeto em cena, a frase gigante trocando, flashes rápidos do acervo).
// Tudo o que "não somos" chega em baixa resolução e, quando passa, é tarjado como num documento
// sigiloso: sobra só o "não". A última frase é a única que entra em foco.
//
// Ritmo: as frases trocam com a rolagem, sem trava. Cada frase pede bastante rolagem e, dentro do
// manifesto, a roda do mouse anda mais devagar (setSlowZone): nada para, mas também nada voa.

const FLASH_POOL = [...new Set(PIECES.filter((p) => hasMedia(p.media) && !p.pending).map((p) => p.media))];
const PHRASES = MANIFESTO.phrases;
const TRUTH = PHRASES.length - 1;
/** fração da rolagem do manifesto para o texto do clube, no fim; o resto se divide entre as frases */
const ABOUT_SHARE = 0.15;
const PHRASE_SHARE = (1 - ABOUT_SHARE) / PHRASES.length;
/** dentro do manifesto, a roda do mouse anda esta fração do normal */
const WHEEL_SLOW = 0.6;
/** flashes do acervo: cada foto fica este tempo (s); as rajadas têm de 3 a 5 fotos emendadas e, entre
 *  uma rajada e outra, um escuro curto */
const FLASH_HOLD = 0.085;
const flashBurst = () => 3 + Math.floor(Math.random() * 3);
const flashGap = () => 0.16 + Math.random() * 0.12;
/** o que não somos fica degradado; o "não", no bitmap mais grosso */
const NOT_REST: Level = 50;
const mark = (p: string) => p.replace(/^(não)\b/i, '[[$1]]');

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** largura do calango de frente, em relação à altura (a caixa dele na tela) */
const GLASS_ASPECT = 0.64;

/**
 * Onde o calango de vidro fica: um lugar só, do começo ao fim (ele não se move, só gira), sempre no
 * campo vazio da direita. Na tela deitada, à direita da coluna das frases (`column`, a borda direita
 * dela), entre o cabeçalho e o texto do clube, sem encostar nas frases nem na borda da tela. Na tela
 * em pé, embaixo da frase e do texto do clube (que aparece no alto), encostado à direita. As medidas
 * chegam em px do palco.
 */
function placeOf(
  tall: boolean,
  m: { w: number; h: number; column: number; header: number; phrase: number; aboutTop: number; aboutBottom: number; rail: number },
): GlassPlace {
  // folga para as legendas do data overlay, acima e abaixo da caixa da peça
  const above = 34;
  const below = 30;
  if (tall) {
    const top = Math.max(m.phrase, m.aboutBottom) + above;
    const bottom = m.rail - below;
    const h = clamp((bottom - top) / m.h, 0.2, 0.5);
    // a borda direita da peça perto da borda da tela, sem o centro passar do meio para a esquerda
    const right = m.w - Math.max(m.w * 0.06, 20);
    const x = Math.max(0.5, (right - (GLASS_ASPECT * h * m.h) / 2) / m.w);
    return { x, y: (top + bottom) / 2 / m.h, h };
  }
  const left = m.column + m.w * 0.035;
  const right = m.w - Math.max(m.w * 0.045, 24);
  const top = m.header + above;
  const bottom = m.aboutTop - below;
  // a altura que cabe entre o cabeçalho e o texto do clube, e a que cabe na largura do campo livre
  const h = clamp(Math.min(bottom - top, ((right - left) / GLASS_ASPECT) * 0.9) / m.h, 0.3, 0.8);
  return { x: (left + right) / 2 / m.w, y: (top + bottom) / 2 / m.h, h };
}

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
  const [index, setIndex] = useState(0);
  // a primeira frase aparece quando o palco chega (senão resolveria escondida, atrás da abertura)
  const [live, setLive] = useState(false);
  const [about, setAbout] = useState(false);
  const [tall, setTall] = useState(() => window.matchMedia('(max-aspect-ratio: 1/1)').matches);
  const [place, setPlace] = useState<GlassPlace>(() => (tall ? { x: 0.68, y: 0.7, h: 0.4 } : { x: 0.78, y: 0.45, h: 0.54 }));
  /** os flashes correm (frases na tela) e o pedido de uma rajada já, na troca de frase */
  const flashing = useRef({ on: false, kick: false });

  useEffect(() => {
    const mq = window.matchMedia('(max-aspect-ratio: 1/1)');
    const on = () => setTall(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // o lugar do calango sai das medidas do palco (coluna e altura das frases, cabeçalho, texto do clube,
  // trilho) e só muda quando a tela muda de tamanho. As medidas vêm do layout (offsetTop/offsetLeft),
  // que não sente transform
  useEffect(() => {
    const section = sectionRef.current!;
    const sticky = section.querySelector<HTMLElement>('.manifesto__sticky')!;
    const stage = section.querySelector<HTMLElement>('.manifesto__stage')!;
    const bar = section.querySelector<HTMLElement>('.manifesto__bar')!;
    const aboutEl = section.querySelector<HTMLElement>('.manifesto__about')!;
    const rail = section.querySelector<HTMLElement>('.manifesto__rail')!;
    const measure = () => {
      const box = sticky.getBoundingClientRect();
      if (!box.width || !box.height) return;
      let phrase = 0;
      section.querySelectorAll<HTMLElement>('.mf-big').forEach((p) => {
        phrase = Math.max(phrase, stage.offsetTop + p.offsetTop + p.offsetHeight);
      });
      const next = placeOf(window.matchMedia('(max-aspect-ratio: 1/1)').matches, {
        w: box.width,
        h: box.height,
        column: stage.offsetLeft + stage.offsetWidth,
        header: bar.offsetTop + bar.offsetHeight,
        phrase,
        aboutTop: aboutEl.offsetTop,
        aboutBottom: aboutEl.offsetTop + aboutEl.offsetHeight,
        rail: rail.offsetTop,
      });
      const round = (v: number) => Math.round(v * 1000) / 1000;
      setPlace((p) => (round(p.x) === round(next.x) && round(p.y) === round(next.y) && round(p.h) === round(next.h) ? p : next));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(sticky);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, []);

  // as frases andam com a rolagem: cada uma tem a sua fatia do trecho preso e, no fim, entra o texto
  // do clube. O trilho enche junto. Dentro do trecho, a roda do mouse anda mais devagar
  useEffect(() => {
    const section = sectionRef.current!;
    const segs = Array.from(railRef.current?.querySelectorAll<HTMLElement>('.manifesto__rail i') ?? []);
    const filled = segs.map(() => -1);
    const state = { index: 0, live: false, about: false };
    const sync = () => {
      const on = state.live && !state.about;
      // os flashes começam com uma rajada na hora
      if (on && !flashing.current.on) flashing.current.kick = true;
      flashing.current.on = on;
    };
    const update = (p: number) => {
      const k = p / PHRASE_SHARE;
      const i = Math.min(TRUTH, Math.floor(k));
      if (i !== state.index) {
        state.index = i;
        setIndex(i);
      }
      const inAbout = p >= 1 - ABOUT_SHARE;
      if (inAbout !== state.about) {
        state.about = inAbout;
        setAbout(inAbout);
        sync();
      }
      segs.forEach((el, n) => {
        const v = Math.round(clamp(k - n, 0, 1) * 1000) / 1000;
        if (v !== filled[n]) el.style.transform = `scaleX(${(filled[n] = v)})`;
      });
    };

    const main = ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => update(self.progress),
      onRefresh: (self) => {
        setSlowZone({ start: self.start, end: self.end, factor: WHEEL_SLOW });
        update(self.progress);
      },
    });
    const seenTrig = ScrollTrigger.create({
      trigger: section,
      start: 'top 45%',
      end: 'bottom 30%',
      onToggle: (self) => {
        state.live = self.isActive;
        setLive(self.isActive);
        sync();
      },
    });
    const label = ScrollTrigger.create({
      trigger: section,
      start: 'top 55%',
      end: 'bottom 45%',
      onToggle: (self) => self.isActive && experience.set({ room: 'Manifesto' }),
    });
    return () => {
      main.kill();
      seenTrig.kill();
      label.kill();
      setSlowZone(null);
      flashing.current.on = false;
    };
  }, []);

  // a troca de frase puxa uma rajada de flashes na hora
  useEffect(() => {
    if (index > 0) flashing.current.kick = true;
  }, [index]);

  // flashes do acervo: enquanto as frases estão na tela, rajadas de fotos emendadas uma na outra, com um
  // escuro curto entre as rajadas. As fotos são escuras e esverdeadas (filtro e opacidade em
  // manifesto.css): nenhuma passa de ~7% de luminância, então nenhuma troca (de foto para foto ou para
  // o escuro) chega ao limiar de flash das diretrizes de acessibilidade, 10%. Com movimento reduzido,
  // não há flashes
  useEffect(() => {
    const flash = flashRef.current;
    if (!flash || reducedMotion) return;
    const imgs = Array.from(flash.querySelectorAll('img'));
    if (!imgs.length) return;
    let shown: HTMLImageElement | null = null;
    let left = 0;
    let next = 0;
    let deck: number[] = [];
    const hide = () => {
      shown?.classList.remove('is-on');
      shown = null;
    };
    // a próxima foto do baralho embaralhado (que recomeça quando acaba), entre as que já carregaram
    const draw = () => {
      for (let tries = 0; tries <= imgs.length; tries++) {
        if (!deck.length) deck = imgs.map((_, i) => i).sort(() => Math.random() - 0.5);
        const img = imgs[deck.pop()!];
        if (img.complete && img.naturalWidth && img !== shown) return img;
      }
      return null;
    };
    const tick = (time: number) => {
      const f = flashing.current;
      if (!f.on) {
        hide();
        left = 0;
        next = 0;
        return;
      }
      if (f.kick) {
        f.kick = false;
        // fora de uma rajada: a próxima começa já
        if (!shown) {
          if (!left) left = flashBurst();
          next = 0;
        }
      }
      if (time < next) return;
      const img = left > 0 ? draw() : null;
      hide();
      if (left > 0) {
        left -= 1;
        if (img) {
          img.classList.add('is-on');
          shown = img;
        }
        next = time + FLASH_HOLD;
      } else {
        left = flashBurst();
        next = time + flashGap();
      }
    };
    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
      hide();
    };
  }, []);

  const truth = index === TRUTH;

  return (
    <section ref={sectionRef} className={`manifesto ${about ? 'is-about' : ''} ${truth ? 'is-truth' : ''}`} id="manifesto" aria-labelledby="manifesto-h">
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

        <GlassCalango place={place} compact={tall} />

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
