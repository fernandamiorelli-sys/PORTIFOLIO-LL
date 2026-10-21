import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { reducedMotion } from './store';

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;

// ───────────────────────────── trecho lento
// Uma seção pode pedir que a roda do mouse (e o trackpad) andem mais devagar dentro dela: o manifesto,
// onde as frases trocam com a rolagem. Nada trava; só cada giro da roda anda menos. O toque no celular
// segue nativo (ali, a seção é mais longa).
let slow: { start: number; end: number; factor: number } | null = null;

/** Entre start e end (rolagem absoluta, px), a roda anda `factor` do normal (null desfaz). */
export function setSlowZone(zone: { start: number; end: number; factor: number } | null) {
  slow = zone;
}

export function initScroll() {
  if (lenis) return lenis;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  lenis = new Lenis({
    autoRaf: false,
    lerp: reducedMotion ? 1 : 0.09,
    wheelMultiplier: 0.95,
    touchMultiplier: 1.1,
    virtualScroll: (data) => {
      // o Lenis usa o delta depois desta chamada: dentro do trecho lento, a roda anda menos
      if (slow && lenis && data.event.type === 'wheel' && lenis.targetScroll >= slow.start - 1 && lenis.targetScroll <= slow.end + 1) {
        data.deltaY *= slow.factor;
      }
      return true;
    },
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
  // só em desenvolvimento: os testes pulam direto para uma sala
  if (import.meta.env.DEV) Object.assign(window, { __lenis: lenis });
  return lenis;
}

export function lockScroll() {
  lenis?.stop();
  document.body.classList.add('is-locked');
}

export function unlockScroll() {
  document.body.classList.remove('is-locked');
  lenis?.start();
  ScrollTrigger.refresh();
}

export function scrollToTarget(target: string | HTMLElement | number, offset = 0) {
  if (!lenis) {
    if (typeof target === 'number') window.scrollTo(0, target);
    return;
  }
  lenis.scrollTo(target, { offset, duration: reducedMotion ? 0 : 1.6 });
}

export function getLenis() {
  return lenis;
}

export { gsap, ScrollTrigger };
