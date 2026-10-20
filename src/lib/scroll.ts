import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { reducedMotion } from './store';

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;

// ───────────────────────────── portão de rolagem
// Uma seção pode segurar a página num ponto (o manifesto, enquanto as frases passam): a rolagem para
// baixo para ali; para cima continua livre. Navegação pelo índice nunca é barrada.
let gateY: number | null = null;
let navigating = false;
let lastScroll = 0;
let killMomentumUntil = 0;

/** y absoluto em que a página para ao descer (null libera). */
export function setScrollGate(y: number | null) {
  gateY = y;
}

/** a página está parada no portão (ou acima dele, prestes a chegar) */
export const atGate = () => gateY != null && lenis != null && lenis.targetScroll >= gateY - 1;

const DOWN_KEYS = new Set(['ArrowDown', 'PageDown', 'End', ' ', 'Spacebar']);

function blocks(deltaY: number) {
  if (gateY == null || navigating || !lenis) return false;
  // só barra quem está acima ou no portão (quem chegou por baixo, pelo índice, rola livre)
  if (lenis.targetScroll > gateY + 1) return false;
  return deltaY > 0 && lenis.targetScroll + deltaY > gateY - 0.5;
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
    virtualScroll: ({ deltaY, event }) => {
      if (!blocks(deltaY)) return true;
      if (event.cancelable) event.preventDefault();
      // chega ao portão com a mesma suavidade de sempre e fica
      if (lenis && lenis.targetScroll < gateY! - 0.5) lenis.scrollTo(gateY!);
      return false;
    },
  });
  lenis.on('scroll', ScrollTrigger.update);
  // barra de rolagem, teclado e inércia do toque passam por fora do Lenis: aqui eles batem no portão
  lenis.on('scroll', () => {
    // a posição que o Lenis já tem (na rolagem nativa ele acabou de ler do navegador): ler de novo
    // a rolagem da janela aqui forçaria um layout a cada quadro
    const y = lenis!.animatedScroll;
    if (gateY != null && !navigating && lastScroll <= gateY + 1 && y > gateY + 1) {
      if (performance.now() > killMomentumUntil) {
        // corta a inércia do toque (no celular, o arremesso continuaria empurrando)
        killMomentumUntil = performance.now() + 400;
        document.documentElement.classList.add('is-gated');
        window.setTimeout(() => document.documentElement.classList.remove('is-gated'), 320);
      }
      lenis!.scrollTo(gateY, { immediate: true, force: true });
      lastScroll = gateY;
      return;
    }
    lastScroll = y;
  });
  window.addEventListener(
    'keydown',
    (e) => {
      if (!DOWN_KEYS.has(e.key) || gateY == null || navigating || !lenis) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input, textarea, select, button, [contenteditable]')) return;
      if (lenis.targetScroll >= gateY - 1 && lenis.targetScroll <= gateY + 1) e.preventDefault();
    },
    { capture: true },
  );
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
  // só em desenvolvimento: os testes pulam direto para uma sala (o portão do manifesto seguraria o pulo)
  if (import.meta.env.DEV) Object.assign(window, { __lenis: lenis, __gate: setScrollGate });
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
  navigating = true;
  lenis.scrollTo(target, {
    offset,
    duration: reducedMotion ? 0 : 1.6,
    onComplete: () => {
      navigating = false;
      lastScroll = lenis!.actualScroll;
    },
  });
  // garantia: se o destino não pedir animação (já está lá), libera mesmo assim
  window.setTimeout(() => {
    if (navigating && lenis && !lenis.isScrolling) {
      navigating = false;
      lastScroll = lenis.actualScroll;
    }
  }, 2200);
}

export function getLenis() {
  return lenis;
}

export { gsap, ScrollTrigger };
