import { useEffect, useRef } from 'react';
import { getLenis, gsap, ScrollTrigger } from '../../lib/scroll';
import { experience, isTouch, reducedMotion } from '../../lib/store';
import { luminance } from '../sections/dayCycle';
import { TopoRenderer, type Lamp } from './topoRenderer';
import './topo.css';

/** Quem pede "reduzir movimento" vê um quadro só, neste instante do relevo. */
const STILL = 24;
/** O relevo anda frações de pixel por quadro: até 24 desenhos por segundo, o ritmo do cinema, bastam
 *  (num monitor de 60 Hz, um a cada três quadros, sempre no mesmo compasso). */
const FRAME_MS = 1000 / 24;
/** Pixels desenhados por quadro: a passada das linhas é leve, então a densidade da tela cabe quase sempre. */
const BUDGET = isTouch ? 3.0e6 : 6.0e6;
/** Força das linhas: no celular, a tela pequena (e o preto do OLED) engole o sutil */
const GAIN = isTouch ? 2.2 : 1;
/** Com a lanterna andando, o relevo desenha mais vezes (até 40 por segundo) para a luz deslizar. */
const LAMP_MS = 25;
/** Só com mouse: no toque não há cursor; com "reduzir movimento", o fundo fica parado. */
const HAS_LAMP = !isTouch && !reducedMotion;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Fundo topográfico: curvas de nível sutis no preto chapado, das salas em diante. Fica entre o fundo
 * (.backdrop) e o conteúdo, sem receber cliques; aparece com a rolagem quando o manifesto acaba, sai
 * enquanto o céu da galeria do dia está claro e para de desenhar quando não há o que mostrar. No
 * computador, o cursor é uma lanterna: as curvas acendem em volta dele.
 */
export function Topo() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    let r: TopoRenderer;
    try {
      r = new TopoRenderer(canvas);
    } catch {
      return; // sem WebGL2: o fundo continua o preto de sempre
    }
    const backdrop = document.querySelector<HTMLElement>('.backdrop');
    const root = document.documentElement;
    let cssW = 0;
    let cssH = 0;
    let quality = 1;
    let dirty = true;
    let failed = false;
    let paused = false; // só para medir com e sem o relevo (desenvolvimento)
    let fade = 0; // rolagem: 0 até o manifesto acabar, 1 dentro das salas
    let sky = 1; // 0 enquanto o céu da galeria do dia está claro
    let skyTarget = 1;
    let lastBg = '';
    let shown = -1;
    let t = STILL;
    let frame = 0;
    let lastTick = performance.now();
    let lastDraw = 0;
    let visibleFor = 0;
    let scrolledAt = -1e9;
    let calmTicks = 0;
    const intervals: number[] = [];
    let gain = GAIN;
    // a lanterna: o cursor acende as curvas em volta dele. A luz segue o ponteiro com um pouco de atraso
    // (desliza em vez de pular), acende quando o mouse chega e apaga quando ele sai da janela
    const pointer = { x: 0, y: 0 };
    const lamp: Lamp = { x: 0, y: 0, amount: 0 };
    let lampTo = 0;
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      // acendendo do zero, a luz nasce onde o cursor está (não vem deslizando de longe)
      if (!lamp.amount) {
        lamp.x = pointer.x;
        lamp.y = pointer.y;
      }
      lampTo = 1;
    };
    const onLeave = (e: PointerEvent) => {
      if (!e.relatedTarget) lampTo = 0;
    };
    if (HAS_LAMP) {
      window.addEventListener('pointermove', onPointer, { passive: true });
      document.addEventListener('pointerout', onLeave, { passive: true });
    }

    const fit = () => {
      if (!cssW || !cssH) return;
      const dpr = window.devicePixelRatio || 1;
      const scale = Math.max(0.5, Math.min(dpr, Math.sqrt(BUDGET / (cssW * cssH))) * quality);
      r.resize(cssW, cssH, scale);
      dirty = true;
    };
    const ro = new ResizeObserver(([e]) => {
      cssW = Math.round(e.contentRect.width);
      cssH = Math.round(e.contentRect.height);
      fit();
    });
    ro.observe(canvas);

    // compila com o navegador ocioso, ainda na tela de abertura (o Safari não tem requestIdleCallback:
    // espera um pouco)
    const compile = () => r.compile(0, gain);
    const hasIdle = typeof (window as Partial<Window>).requestIdleCallback === 'function';
    const idle = hasIdle ? window.requestIdleCallback(compile, { timeout: 2500 }) : window.setTimeout(compile, 600);

    const trigger = ScrollTrigger.create({
      trigger: '#sala-sangue-frio',
      start: 'top 85%',
      end: 'top 30%',
      onUpdate: (self) => (fade = self.progress),
      onRefresh: (self) => (fade = self.progress),
    });

    const tick = () => {
      const now = performance.now();
      const interval = now - lastTick;
      const dt = Math.min(0.1, interval / 1000);
      lastTick = now;
      if (failed || paused || document.hidden) return; // aba oculta: nada anda, nada desenha

      // o céu da galeria do dia (a cor dele chega em linha no .backdrop): o relevo sai quando clareia
      const bg = backdrop?.style.getPropertyValue('--bg').trim() ?? '';
      if (bg !== lastBg) {
        lastBg = bg;
        skyTarget = bg.startsWith('#') ? 1 - smoothstep(0.003, 0.006, luminance(bg)) : 1;
      }
      sky += (skyTarget - sky) * Math.min(1, dt * 5);
      if (Math.abs(skyTarget - sky) < 0.004) sky = skyTarget;
      const opacity = Math.round(fade * sky * 100) / 100;
      if (opacity !== shown) {
        if (!shown) dirty = true; // volta a aparecer: desenha logo
        canvas.style.opacity = String((shown = opacity));
      }

      // os programas ficam prontos (ligados e com um desenho minúsculo) enquanto a abertura está na tela:
      // o trabalho pesado do driver não cai no manifesto nem na rolagem, quando o relevo aparece
      if (!r.ready && (opacity || experience.get().phase !== 'site')) {
        try {
          if (r.poll()) r.warm();
        } catch (err) {
          failed = true;
          canvas.style.opacity = '0';
          if (import.meta.env.DEV) console.warn(err);
          return;
        }
      }
      if (!opacity) {
        visibleFor = 0;
        return;
      }
      if (!r.ready) return;
      // índice ou ficha abertos: o Lenis para e a tela está coberta
      if (root.classList.contains('lenis-stopped')) return;

      if (reducedMotion) {
        if (dirty) r.draw(STILL, 0);
        dirty = false;
        return;
      }

      // rolando (e logo depois), o relevo espera: ele anda menos de 2 px por segundo, ninguém nota a pausa,
      // e a GPU fica inteira para a rolagem. O primeiro quadro, quando ele aparece, sai mesmo assim
      // (300 ms e ao menos três quadros parados: num aparelho lento, os quadros passam de 300 ms)
      if (getLenis()?.isScrolling) {
        scrolledAt = now;
        calmTicks = 0;
      } else calmTicks++;
      if ((now - scrolledAt < 300 || calmTicks < 3) && !dirty) return;

      // qualidade: se a página cai abaixo do ritmo da tela com o relevo à vista, ele desenha menos pixels
      visibleFor += interval;
      if (visibleFor > 1200) {
        intervals.push(interval);
        if (intervals.length >= 90) {
          intervals.sort((a, b) => a - b);
          const median = intervals[45];
          const best = intervals[9];
          intervals.length = 0;
          if (median > 12 && median > best * 1.35 && quality > 0.55) {
            quality *= 0.8;
            fit();
          }
        }
      }

      // a lanterna: enquanto a luz anda ou acende, o relevo desenha mais vezes; parada, no ritmo de sempre
      let lampMoving = false;
      if (HAS_LAMP && (lampTo || lamp.amount)) {
        const was = { x: lamp.x, y: lamp.y, amount: lamp.amount };
        const follow = 1 - Math.exp(-dt / 0.09);
        lamp.x += (pointer.x - lamp.x) * follow;
        lamp.y += (pointer.y - lamp.y) * follow;
        lamp.amount += (lampTo - lamp.amount) * (1 - Math.exp(-dt / 0.22));
        if (Math.abs(lampTo - lamp.amount) < 0.003) lamp.amount = lampTo;
        lampMoving = lamp.amount !== was.amount || (lamp.amount > 0 && Math.abs(lamp.x - was.x) + Math.abs(lamp.y - was.y) > 0.25);
      }

      t += dt;
      if (!dirty && now - lastDraw < (lampMoving ? LAMP_MS : FRAME_MS - 4)) return;
      lastDraw = now;
      dirty = false;
      r.draw(t, frame++, toCanvas());
    };
    gsap.ticker.add(tick);

    /** o cursor em px do canvas (de baixo para cima, como o gl_FragCoord) */
    const toCanvas = (): Lamp => ({
      x: (lamp.x / Math.max(1, cssW)) * canvas.width,
      y: (1 - lamp.y / Math.max(1, cssH)) * canvas.height,
      amount: lamp.amount,
    });

    const lost = (e: Event) => {
      e.preventDefault();
      r.reset();
    };
    const restored = () => {
      r.compile(0, gain);
      fit();
    };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);

    if (import.meta.env.DEV) {
      Object.assign(window, {
        __topo: {
          stats: () => ({ draws: frame, quality, opacity: shown, width: canvas.width, height: canvas.height, ready: r.ready, time: t, lamp: lamp.amount, gain }),
          /** 0 final · 1 altura · 2 inclinação · 5 máscara das linhas · 7 prévia sobre o preto */
          debug: (mode: number) => {
            r.compile(mode, gain);
            dirty = true;
          },
          gain: (g: number) => {
            gain = g;
            r.compile(0, gain);
            dirty = true;
          },
          pause: (on: boolean) => {
            paused = on;
            canvas.style.opacity = on ? '0' : String(shown);
          },
        },
      });
    }

    return () => {
      gsap.ticker.remove(tick);
      trigger.kill();
      ro.disconnect();
      if (hasIdle) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      if (HAS_LAMP) {
        window.removeEventListener('pointermove', onPointer);
        document.removeEventListener('pointerout', onLeave);
      }
      r.dispose();
    };
  }, []);

  return <canvas ref={ref} className="topo" aria-hidden="true" />;
}
