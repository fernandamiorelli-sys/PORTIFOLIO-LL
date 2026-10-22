import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { reducedMotion } from './store';

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;

export function initScroll() {
  if (lenis) return lenis;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  lenis = new Lenis({
    autoRaf: false,
    lerp: reducedMotion ? 1 : 0.09,
    wheelMultiplier: 0.95,
    touchMultiplier: 1.1,
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
