import { useEffect, useRef, useState } from 'react';
import { MANIFESTO, PIECES } from '../../data/pieces';
import { getLenis, gsap, ScrollTrigger } from '../../lib/scroll';
import { hasMedia, imageUrl } from '../../lib/media';
import { reducedMotion } from '../../lib/store';
import './manifesto.css';

// Referência: kinoria.studio. O objeto 3D atrás, o título na frente se reembaralhando a cada
// frase, e flashes rápidos do acervo conforme a pessoa rola.

const FLASH_POOL = [...new Set(PIECES.filter((p) => hasMedia(p.media) && !p.pending).map((p) => p.media))];
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÃÇÉÊÓ0123456789<>/\\#%&*+=';

export function Manifesto() {
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLParagraphElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [about, setAbout] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    const section = sectionRef.current!;
    const total = MANIFESTO.phrases.length;
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

    // o título estica conforme a velocidade do scroll (largura variável da Anybody)
    let stretch = 62;
    const onTick = () => {
      const v = Math.abs(getLenis()?.velocity ?? 0);
      const target = 62 + Math.min(58, v * 1.6);
      stretch += (target - stretch) * 0.12;
      if (titleRef.current) titleRef.current.style.fontStretch = `${stretch.toFixed(1)}%`;
    };
    if (!reducedMotion) gsap.ticker.add(onTick);
    return () => {
      st.kill();
      gsap.ticker.remove(onTick);
    };
  }, []);

  // troca de frase: embaralha e dispara até 3 flashes do acervo (≤ 3 por segundo)
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const text = MANIFESTO.phrases[index].toUpperCase();
    if (reducedMotion) {
      el.textContent = text;
      return;
    }
    const tween = gsap.to(el, {
      duration: 0.9,
      scrambleText: { text, chars: GLYPHS, speed: 0.6, revealDelay: 0.15 },
      ease: 'none',
    });
    const flash = flashRef.current;
    const timers: number[] = [];
    if (flash && index > 0) {
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
    }
    return () => {
      tween.kill();
      timers.forEach(clearTimeout);
    };
  }, [index]);

  const last = index === MANIFESTO.phrases.length - 1;

  return (
    <section ref={sectionRef} className={`manifesto ${about ? 'is-about' : ''}`} id="manifesto" aria-labelledby="manifesto-h">
      <div className="manifesto__sticky">
        <div ref={flashRef} className="manifesto__flash" aria-hidden="true">
          {FLASH_POOL.map((slug) => (
            <img key={slug} src={imageUrl(slug, 960, 'webp')} alt="" loading="lazy" decoding="async" />
          ))}
        </div>

        <div className="manifesto__anchor" data-calango="manifesto" data-calango-spin="0.5" data-calango-tilt="1" aria-hidden="true" />

        <h2 id="manifesto-h" className="sr-only">
          Manifesto
        </h2>
        <ol className="sr-only">
          {MANIFESTO.phrases.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>

        <p className="manifesto__kicker t-mono" aria-hidden="true">
          Manifesto <b>{String(index + 1).padStart(2, '0')}</b> / {String(MANIFESTO.phrases.length).padStart(2, '0')}
        </p>
        <p ref={titleRef} className={`manifesto__title t-display ${last ? 'is-truth' : ''}`} aria-hidden="true" />

        <div className="manifesto__about">
          <p className="t-mono manifesto__about-k">Abigos FR · fundado em 2026</p>
          {MANIFESTO.about.map((p) => (
            <p key={p} className="t-body">
              {p}
            </p>
          ))}
        </div>

        <div className="manifesto__rail" aria-hidden="true">
          {MANIFESTO.phrases.map((_, i) => (
            <span key={i} className={i <= index ? 'is-on' : undefined} />
          ))}
        </div>
      </div>
    </section>
  );
}
