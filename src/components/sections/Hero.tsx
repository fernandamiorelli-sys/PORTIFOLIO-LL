import { useEffect, useRef } from 'react';
import { AsciiCalango } from '../intro/asciiCalango';
import { Picture } from '../piece/Picture';
import { Signature, type SignatureHandle } from '../piece/Signature';
import { handoff } from '../../lib/handoff';
import { gsap, ScrollTrigger } from '../../lib/scroll';
import { experience, isTouch, reducedMotion, useExperience } from '../../lib/store';
import { charsOf, Resolve, scrubResolve } from '../type/Resolve';
import './hero.css';

// Referência: landonorris.com. A foto ocupa a tela; ao rolar, encolhe para uma moldura de museu,
// perde a cor e recebe a assinatura. O calango de código, que veio do hacking, fica no canto.
// No computador a foto é a horizontal (3:2) e a moldura também; no celular, a vertical, em retrato.

/** A tela larga (a mesma divisa do CSS: até 760 px é celular) e as fotos de cada recorte. */
export const HERO_WIDE = '(min-width: 761px)';
export const HERO_PHOTOS = {
  tall: { color: 'lucas-lopes-dono', pb: 'lucas-lopes-dono-pb' },
  wide: { color: 'lucas-lopes-dono-3x2', pb: 'lucas-lopes-dono-3x2-pb' },
} as const;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const range = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function Hero() {
  const phase = useExperience((s) => s.phase);
  const sectionRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const pbRef = useRef<HTMLDivElement>(null);
  const sigRef = useRef<SignatureHandle>(null);
  const asciiWrapRef = useRef<HTMLDivElement>(null);
  const asciiCanvasRef = useRef<HTMLCanvasElement>(null);
  const asciiRef = useRef<AsciiCalango | null>(null);
  const entered = phase === 'site';

  // calango ASCII do hero: mesmo desenho do hacking, já completo
  useEffect(() => {
    const canvas = asciiCanvasRef.current!;
    const ascii = new AsciiCalango(canvas);
    ascii.progress = 1;
    asciiRef.current = ascii;
    const fit = () => {
      const r = canvas.getBoundingClientRect();
      ascii.resize(r.width, r.height);
    };
    fit();
    window.addEventListener('resize', fit);
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      // depois de formado, 30 fps bastam para o brilho residual
      if (now - last < 33) return;
      last = now;
      ascii.draw(now);
    };
    // só desenha enquanto o hero está na tela
    const io = new IntersectionObserver(([e]) => {
      cancelAnimationFrame(raf);
      raf = e.isIntersecting ? requestAnimationFrame(loop) : 0;
    });
    io.observe(canvas);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
    };
  }, []);

  // entrada vinda do hacking: o calango voa do centro para o canto e a foto acende na virada
  useEffect(() => {
    if (!entered) return;
    const wrap = asciiWrapRef.current!;
    const from = handoff.asciiRect;
    const to = wrap.getBoundingClientRect();
    const tl = gsap.timeline();
    if (from && !reducedMotion) {
      tl.fromTo(
        wrap,
        {
          x: from.left + from.width / 2 - (to.left + to.width / 2),
          y: from.top + from.height / 2 - (to.top + to.height / 2),
          scale: from.height / to.height,
        },
        { x: 0, y: 0, scale: 1, duration: 1.3, ease: 'expo.inOut', clearProps: 'transform' },
        0.15,
      );
    }
    tl.fromTo('.hero__flash', { opacity: 1 }, { opacity: 0, duration: 1.1, ease: 'power2.out' }, 0);
    tl.fromTo(frameRef.current, { scale: 1.12, filter: 'brightness(1.8)' }, { scale: 1, filter: 'brightness(1)', duration: 1.6, ease: 'expo.out', clearProps: 'filter' }, 0);
    tl.fromTo('.hero__overlay > *', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 1, stagger: 0.08, ease: 'expo.out' }, 0.5);
    return () => {
      tl.kill();
    };
  }, [entered]);

  // coreografia de scroll
  useEffect(() => {
    const section = sectionRef.current!;
    const frame = frameRef.current!;
    const pb = pbRef.current!;
    const sticky = section.querySelector<HTMLElement>('.hero__sticky')!;
    const overlay = section.querySelectorAll<HTMLElement>('.hero__overlay');
    const names = section.querySelectorAll<HTMLElement>('.hero__name');
    const nameChars = Array.from(names).map((el) => charsOf(el));
    const caption = section.querySelector<HTMLElement>('.hero__caption')!;
    const hint = section.querySelector<HTMLElement>('.hero__hint')!;

    // o tamanho do palco só muda com a janela (medido no refresh, não a cada quadro de rolagem)
    let vw = sticky.clientWidth;
    let vh = sticky.clientHeight;
    const apply = (p: number) => {
      const mobile = vw <= 760;
      // moldura final, centrada: no celular, retrato 9:16; no computador, a foto horizontal (3:2), com
      // espaço dos lados para o nome (a mesma conta do tamanho do nome em hero.css)
      const fh = mobile ? Math.min(vh * 0.62, vw * 1.25) : Math.min(vh * 0.5, (vw * 0.52) / 1.5);
      const fw = fh * (mobile ? 9 / 16 : 1.5);
      const s = easeInOut(range(p, 0.02, 0.55));
      const w = vw + (fw - vw) * s;
      const h = vh + (fh - vh) * s;
      frame.style.width = `${w}px`;
      frame.style.height = `${h}px`;
      frame.style.setProperty('--frame-border', `${s * 10}px`);
      frame.style.setProperty('--scrim', String(1 - s * 0.7));
      pb.style.opacity = String(ease(range(p, 0.22, 0.6)));
      sigRef.current?.set(range(p, 0.48, 0.9));
      const n = ease(range(p, 0.3, 0.7));
      names.forEach((el, i) => {
        el.style.opacity = String(Math.min(1, n * 3));
        el.style.transform = `translateX(${(1 - n) * (i ? 6 : -6)}vw)`;
        // o nome entra em foco junto com a moldura: do bitmap à serifa
        scrubResolve(nameChars[i], n, { band: 0.45, seed: i + 7 });
      });
      overlay.forEach((el) => (el.style.opacity = String(1 - range(p, 0.0, 0.14))));
      caption.style.opacity = String(ease(range(p, 0.62, 0.88)));
      hint.style.opacity = String(1 - range(p, 0, 0.06));
    };
    apply(0);

    const pin = ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      onUpdate: (self) => apply(self.progress),
      onRefresh: (self) => {
        vw = sticky.clientWidth;
        vh = sticky.clientHeight;
        apply(self.progress);
      },
    });
    const label = ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: 'bottom 45%',
      onToggle: (self) => self.isActive && experience.set({ room: 'O idealizador' }),
    });
    return () => {
      pin.kill();
      label.kill();
    };
  }, []);

  return (
    <section ref={sectionRef} className="hero" id="idealizador" aria-label="O idealizador">
      <div className="hero__sticky">
        <div className="hero__names t-display" aria-hidden="true">
          <Resolve className="hero__name" text="Lucas" upper trigger="none" />
          <Resolve className="hero__name" text="Lopes" upper trigger="none" />
        </div>

        <div ref={frameRef} className="hero__frame">
          <Picture
            slug={HERO_PHOTOS.tall.color}
            art={{ slug: HERO_PHOTOS.wide.color, media: HERO_WIDE }}
            alt="Lucas Lopes, de suéter preto, olhando para cima em direção a uma claraboia circular que ilumina a parede clara."
            sizes="100vw"
            eager
            className="hero__pic"
          />
          <div ref={pbRef} className="hero__pb">
            <Picture slug={HERO_PHOTOS.tall.pb} art={{ slug: HERO_PHOTOS.wide.pb, media: HERO_WIDE }} alt="" sizes="60vw" eager className="hero__pic" />
          </div>
          <Signature ref={sigRef} className="hero__sig" />
        </div>

        <div className="hero__overlay hero__overlay--left">
          <p className="t-mono">O idealizador</p>
          <p className="hero__lede t-serif">
            Antes do escudo, das camisas e das campanhas, havia um time que só existia no coração de alguns amigos.
          </p>
        </div>
        <div className="hero__overlay hero__overlay--right t-mono">
          <span>Lucas Lopes</span>
          <span>Diretor de arte · 21</span>
          <span>Manaus → Porto Alegre</span>
        </div>

        <div className="hero__caption t-mono">
          <span>Fig. 00</span>
          <span>Lucas Lopes, diretor de arte do Abigos FR.</span>
          <span>Porto Alegre, 2026.</span>
        </div>

        <div ref={asciiWrapRef} className="hero__ascii" aria-hidden="true">
          <canvas ref={asciiCanvasRef} />
        </div>

        {/* o convite para rolar: aparece logo depois do ACESSO CONCEDIDO e some no primeiro movimento */}
        <div className="hero__hint" aria-hidden="true">
          <div className={`hero__hint-in ${isTouch ? 'is-touch' : ''} ${entered ? 'is-in' : ''}`}>
            <span className="hero__scroll">
              <i />
            </span>
            <span className="hero__hint-t t-mono">{isTouch ? 'Deslize para entrar' : 'Role para entrar'}</span>
          </div>
        </div>
        <div className="hero__flash" aria-hidden="true" />
      </div>
    </section>
  );
}
