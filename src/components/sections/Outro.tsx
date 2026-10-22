import { useEffect, useRef } from 'react';
import { ABOUT, ROOMS } from '../../data/pieces';
import { CONTACT, SITE } from '../../data/site';
import { gsap, scrollToTarget, ScrollTrigger } from '../../lib/scroll';
import { experience, reducedMotion } from '../../lib/store';
import { Picture } from '../piece/Picture';
import { Signature, type SignatureHandle } from '../piece/Signature';
import { charsOf, Resolve, scrubResolve, setLevel } from '../type/Resolve';
import { Corridor } from './Corridor';
import './outro.css';

// ───────────────────────────── SOBRE
// Escrito como a entrada de um personagem no roteiro: cabeçalho de cena, nome em caixa alta com a idade,
// e a descrição em ação. A ficha do personagem e as referências ficam ao lado, como notas de produção.
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
      <Corridor
        label="Corredor"
        route={`${ROOMS.at(-1)?.n} → Sobre`}
        exit="Fim das salas"
        items={['Saída da exposição → O idealizador', `${SITE.author} (21)`, 'Diretor de arte', 'Abigos FR', `Temporada ${SITE.year}`]}
      />
      <p className="about__slug t-mono">
        <span>Int. sala da claraboia — dia</span>
        <i aria-hidden="true" />
        <span>Sobre o idealizador</span>
      </p>
      <h2 id="about-h" className="about__name t-display">
        <Resolve text={SITE.author} upper />
        <span className="about__age t-mono">(21)</span>
      </h2>

      <div className="about__grid">
        <figure className="about__portrait">
          <Picture slug="lucas-lopes-dono-pb" alt="Retrato em preto e branco de Lucas Lopes olhando para a luz." sizes="(max-width: 900px) 60vw, 24vw" />
          <figcaption className="t-mono">
            <span>Fig. 02</span> Lucas Lopes, sob a claraboia.
          </figcaption>
        </figure>

        <div className="about__action">
          <p className="about__scene t-body">
            Um feixe de luz circular desce do teto. Embaixo dele, <b>LUCAS LOPES</b> (21), suéter preto, olha para cima como quem espera uma ideia cair.
          </p>
          {ABOUT.paragraphs.map((p, i) => (
            <p key={p} className={i === 0 ? 'about__lede t-serif' : 't-body'}>
              {p}
            </p>
          ))}
        </div>

        <aside className="about__sheet">
          <p className="about__k t-mono">Ficha do personagem</p>
          <dl className="about__facts t-mono">
            {ABOUT.facts.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <i aria-hidden="true" />
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="about__k t-mono">Referências citadas nesta exposição</p>
          <ul className="about__refs">
            {ABOUT.repertoire.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}

// ───────────────────────────── FECHAMENTO
// A frase do título se completa: o que não somos perde a resolução, o que somos entra em foco.
// Depois, o reforço que faltava: um contrato de transferência, já assinado por um dos lados.

const today = () => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date());

export function Closing() {
  const ref = useRef<HTMLElement>(null);
  const phraseRef = useRef<HTMLHeadingElement>(null);
  const signRef = useRef<HTMLDivElement>(null);
  const sigRef = useRef<SignatureHandle>(null);
  const ctaRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const section = ref.current!;
    const phrase = phraseRef.current!;
    const first = charsOf(phrase.querySelector('.closing__l1'));
    const not = first.filter((c) => c.dataset.rest !== '100');
    const are = charsOf(phrase.querySelector('.closing__l2'));
    // o "não" já nasce no bitmap mais grosso
    setLevel(
      first.filter((c) => c.dataset.rest === '100'),
      100,
    );
    const apply = (p: number) => {
      // a primeira linha (o que não somos) perde o foco enquanto a segunda (o que somos) entra em foco
      if (reducedMotion) return;
      scrubResolve(not, Math.min(1, p * 1.4), { from: 0, to: 70, band: 0.4, seed: 3 });
      scrubResolve(are, Math.max(0, p * 1.25 - 0.2), { from: 'off', to: 0, band: 0.35, seed: 5 });
    };
    const st = ScrollTrigger.create({
      trigger: phrase,
      start: 'top 85%',
      end: 'top 22%',
      onUpdate: (self) => apply(self.progress),
      onRefresh: (self) => apply(self.progress),
      onToggle: (self) => self.isActive && experience.set({ room: 'Vamos trabalhar juntos' }),
    });
    apply(st.progress);

    const label = ScrollTrigger.create({
      trigger: section,
      start: 'top 55%',
      end: 'bottom bottom',
      onToggle: (self) => self.isActive && experience.set({ room: 'Vamos trabalhar juntos' }),
    });

    // a assinatura do Lucas se escreve quando a linha de assinatura chega
    const sign = ScrollTrigger.create({
      trigger: signRef.current,
      start: 'top 92%',
      end: 'top 55%',
      onUpdate: (self) => sigRef.current?.set(reducedMotion ? 1 : self.progress),
      onRefresh: (self) => sigRef.current?.set(reducedMotion ? 1 : self.progress),
    });

    // a chamada é magnética
    const cta = ctaRef.current!;
    const onMove = (e: PointerEvent) => {
      if (reducedMotion) return;
      const r = cta.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2);
      const y = e.clientY - (r.top + r.height / 2);
      gsap.to(cta, { x: x * 0.16, y: y * 0.26, duration: 0.6, ease: 'power3.out' });
    };
    const onLeave = () => gsap.to(cta, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.4)' });
    cta.addEventListener('pointermove', onMove);
    cta.addEventListener('pointerleave', onLeave);
    return () => {
      st.kill();
      label.kill();
      sign.kill();
      cta.removeEventListener('pointermove', onMove);
      cta.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <section ref={ref} className="closing" id="contato" aria-labelledby="closing-h">
      <h2 ref={phraseRef} id="closing-h" className="closing__phrase t-display">
        <Resolve className="closing__l1" text="Tudo o que [[não]] somos" upper trigger="none" from={0} rest={70} />
        <Resolve className="closing__l2" text={SITE.closing} upper trigger="none" from="off" />
      </h2>

      <article className="contract" aria-labelledby="contract-h">
        <header className="contract__top t-mono">
          <span>Contrato de transferência · nº 001/{SITE.year}</span>
          <span>{SITE.club} · Porto Alegre</span>
        </header>
        <h3 id="contract-h" className="contract__title t-display">
          Termo de
          <br />
          transferência
        </h3>
        <p className="contract__pre">
          Pelo presente instrumento particular, de um lado <b>LUCAS LOPES</b>, diretor de arte, 21 anos, natural de Manaus e radicado em Porto Alegre, doravante <b>CONTRATADO</b>; e, de outro,{' '}
          <b>VOCÊ</b>, doravante <b>CONTRATANTE</b>, têm entre si justo e acertado o seguinte:
        </p>
        <ol className="contract__clauses">
          <li>
            <b>Cláusula 1ª — Do objeto.</b> Direção de arte e direção criativa de campanhas, filmes, imagens e identidades visuais, com inteligência artificial dirigida até o ponto em que ninguém
            consiga dizer que foi feita por IA.
          </li>
          <li>
            <b>Cláusula 2ª — Do método.</b> Obsessão por processo. Repertório de filmes, séries, videogames, músicas e livros, ressignificado num novo contexto. A imperfeição como direção, quando é
            ela que torna a imagem crível.
          </li>
          <li>
            <b>Cláusula 3ª — Das condições.</b> A combinar, numa conversa.
          </li>
          <li>
            <b>Cláusula 4ª — Do foro.</b> Fica eleito o foro de Porto Alegre, RS.
          </li>
        </ol>
        <p className="contract__date">E, por estarem de acordo, assinam o presente. Porto Alegre, {today()}.</p>

        <div ref={signRef} className="contract__sign">
          <div className="contract__party">
            <div className="contract__ink">
              <Signature ref={sigRef} className="contract__sig" />
            </div>
            <p className="contract__who t-mono">
              Lucas Lopes <span>· contratado</span>
            </p>
          </div>
          <div className="contract__party is-you">
            <div className="contract__ink">
              <a ref={ctaRef} className="closing__cta" href={CONTACT.whatsapp} target="_blank" rel="noopener noreferrer" data-cursor="Assinar">
                <span className="closing__cta-label t-display">Vamos trabalhar juntos</span>
                <span className="closing__cta-sub t-mono">WhatsApp · resposta direta do Lucas</span>
              </a>
            </div>
            <p className="contract__who t-mono">
              Você <span>· contratante</span>
            </p>
          </div>
        </div>
      </article>

      <ul className="closing__links t-mono">
        <li>
          <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
        </li>
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
        <button type="button" className="t-mono" onClick={() => scrollToTarget(0)}>
          Voltar ao início ↑
        </button>
      </footer>
    </section>
  );
}
