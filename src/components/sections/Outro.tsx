import { useEffect, useRef } from 'react';
import { ABOUT } from '../../data/pieces';
import { CONTACT, SITE } from '../../data/site';
import { gsap, scrollToTarget, ScrollTrigger } from '../../lib/scroll';
import { experience, reducedMotion } from '../../lib/store';
import { Picture } from '../piece/Picture';
import './outro.css';

// ───────────────────────────── SOBRE
export function About() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const st = ScrollTrigger.create({
      trigger: ref.current,
      start: 'top 55%',
      end: 'bottom 45%',
      onToggle: (self) => self.isActive && experience.set({ room: 'O idealizador' }),
    });
    return () => st.kill();
  }, []);

  return (
    <section ref={ref} className="about" id="sobre" aria-labelledby="about-h">
      <div className="about__head">
        <p className="t-mono about__k">Sobre o idealizador</p>
        <h2 id="about-h" className="about__name t-display">
          Lucas
          <br />
          Lopes
        </h2>
        <div className="about__portrait">
          <Picture slug="lucas-lopes-dono-pb" alt="Retrato em preto e branco de Lucas Lopes olhando para a luz." sizes="(max-width: 760px) 50vw, 18vw" />
        </div>
      </div>
      <div className="about__body">
        {ABOUT.paragraphs.map((p, i) => (
          <p key={p} className={i === 0 ? 'about__lede t-serif' : 't-body'}>
            {p}
          </p>
        ))}
        <dl className="about__facts t-mono">
          {ABOUT.facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="about__rep">
          <p className="t-mono about__k">Repertório citado nesta exposição</p>
          <p className="about__rep-list">
            {ABOUT.repertoire.map((r, i) => (
              <span key={r}>
                {r}
                {i < ABOUT.repertoire.length - 1 ? <i aria-hidden="true"> / </i> : null}
              </span>
            ))}
          </p>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────── FECHAMENTO
export function Closing() {
  const ref = useRef<HTMLElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  const finalRef = useRef<HTMLSpanElement>(null);
  const ctaRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const section = ref.current!;
    const final = finalRef.current!;
    const text = SITE.closing.toUpperCase();
    final.textContent = reducedMotion ? text : '';
    const st = ScrollTrigger.create({
      trigger: section,
      start: 'top 70%',
      end: 'top 15%',
      scrub: true,
      onUpdate: (self) => {
        // o "não" é riscado conforme a pessoa chega ao fim
        lineRef.current?.style.setProperty('transform', `scaleX(${Math.min(1, self.progress * 1.6)})`);
      },
      onToggle: (self) => self.isActive && experience.set({ room: 'Vamos trabalhar juntos' }),
    });
    const reveal = ScrollTrigger.create({
      trigger: section,
      start: 'top 30%',
      once: true,
      onEnter: () => {
        if (reducedMotion) return;
        gsap.to(final, { duration: 1.6, scrambleText: { text, chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', speed: 0.5, revealDelay: 0.3 }, ease: 'none' });
      },
    });

    // botão magnético
    const cta = ctaRef.current!;
    const onMove = (e: PointerEvent) => {
      const r = cta.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2);
      const y = e.clientY - (r.top + r.height / 2);
      gsap.to(cta, { x: x * 0.18, y: y * 0.28, duration: 0.6, ease: 'power3.out' });
    };
    const onLeave = () => gsap.to(cta, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.4)' });
    cta.addEventListener('pointermove', onMove);
    cta.addEventListener('pointerleave', onLeave);
    return () => {
      st.kill();
      reveal.kill();
      cta.removeEventListener('pointermove', onMove);
      cta.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <section ref={ref} className="closing" id="contato" aria-labelledby="closing-h">
      <h2 id="closing-h" className="closing__phrase t-display">
        <span className="sr-only">Tudo o que não somos {SITE.closing}</span>
        <span className="closing__first" aria-hidden="true">
          Tudo o que{' '}
          <span className="closing__nao">
            não
            <span ref={lineRef} className="closing__strike" aria-hidden="true" />
          </span>{' '}
          somos
        </span>
        <span ref={finalRef} className="closing__final" aria-hidden="true" />
      </h2>

      <a ref={ctaRef} className="closing__cta" href={CONTACT.whatsapp} target="_blank" rel="noopener noreferrer" data-cursor="WhatsApp">
        <span className="closing__cta-label t-display">Vamos trabalhar juntos</span>
        <span className="closing__cta-sub t-mono">WhatsApp · resposta direta do Lucas</span>
      </a>

      <ul className="closing__links t-mono">
        <li>
          <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
        </li>
        {CONTACT.instagram ? (
          <li>
            <a href={CONTACT.instagram} target="_blank" rel="noopener noreferrer">
              {CONTACT.instagramLabel}
            </a>
          </li>
        ) : null}
        <li>
          <a href={CONTACT.whatsapp} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
        </li>
      </ul>

      <footer className="closing__foot t-mono">
        <span>
          © {SITE.year} {SITE.author} · {SITE.club} · Porto Alegre, RS
        </span>
        <span>Direção de arte e geração: Lucas Lopes, com Higgsfield</span>
        <span>Trilha da exposição: Tame Impala, “New Person, Same Old Mistakes” (instrumental)</span>
        <button type="button" onClick={() => scrollToTarget(0)}>
          Voltar ao início ↑
        </button>
      </footer>
    </section>
  );
}
