import { useEffect, useRef } from 'react';
import { AsciiCalango } from '../intro/asciiCalango';
import { Picture } from '../piece/Picture';
import { Signature, type SignatureHandle } from '../piece/Signature';
import { calangoBus } from '../../lib/calangoBus';
import { handoff } from '../../lib/handoff';
import { gsap, ScrollTrigger } from '../../lib/scroll';
import { reducedMotion, useExperience } from '../../lib/store';
import './hero.css';

// Referência: landonorris.com. A foto ocupa a tela; ao rolar, encolhe para uma moldura de museu,
// perde a cor e recebe a assinatura. Na saída, o calango de código vira o calango 3D.

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
      // depois de formado, 30 fps bastam para o brilho residual
      if (now - last > 33) {
        last = now;
        ascii.dissolve = calangoBus.reveal;
        if (calangoBus.reveal < 1) ascii.draw(now);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
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
    const caption = section.querySelector<HTMLElement>('.hero__caption')!;
    const hint = section.querySelector<HTMLElement>('.hero__hint')!;

    const apply = (p: number) => {
      const vw = sticky.clientWidth;
      const vh = sticky.clientHeight;
      const mobile = vw < 760;
      // moldura final: retrato 9:16 centrado
      const fh = mobile ? Math.min(vh * 0.62, vw * 1.25) : vh * 0.7;
      const fw = fh * (9 / 16);
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
        el.style.opacity = String(n);
        el.style.transform = `translateX(${(1 - n) * (i ? 6 : -6)}vw)`;
        el.style.fontStretch = `${60 + n * 75}%`;
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
      onRefresh: (self) => apply(self.progress),
    });
    // saída: a moldura sobe e o calango ASCII vira 3D
    const morph = ScrollTrigger.create({
      trigger: section,
      start: 'bottom bottom',
      end: 'bottom 35%',
      scrub: true,
      onUpdate: (self) => (calangoBus.reveal = self.progress),
      onLeave: () => (calangoBus.reveal = 1),
      onLeaveBack: () => (calangoBus.reveal = 0),
    });
    return () => {
      pin.kill();
      morph.kill();
    };
  }, []);

  return (
    <section ref={sectionRef} className="hero" id="idealizador" aria-label="O idealizador">
      <div className="hero__sticky">
        <div className="hero__names t-display" aria-hidden="true">
          <span className="hero__name">Lucas</span>
          <span className="hero__name">Lopes</span>
        </div>

        <div ref={frameRef} className="hero__frame">
          <Picture
            slug="lucas-lopes-dono"
            alt="Lucas Lopes, de suéter preto, olhando para cima em direção a uma claraboia circular que ilumina a parede clara."
            sizes="100vw"
            eager
            className="hero__pic"
            position="50% 38%"
          />
          <div ref={pbRef} className="hero__pb">
            <Picture slug="lucas-lopes-dono-pb" alt="" sizes="60vw" eager className="hero__pic" position="50% 38%" />
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

        <div ref={asciiWrapRef} className="hero__ascii" data-calango="hero" data-calango-tilt="0" aria-hidden="true">
          <canvas ref={asciiCanvasRef} />
        </div>

        <div className="hero__hint t-mono" aria-hidden="true">
          <span>Role</span>
          <i />
        </div>
        <div className="hero__flash" aria-hidden="true" />
      </div>
    </section>
  );
}
