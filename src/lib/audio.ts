import { AUDIO } from '../data/site';
import { experience } from './store';

/**
 * Diretor de áudio da exposição.
 * - A música começa em AUDIO.startAt com fade-in e estabiliza em AUDIO.dropAt (a virada do instrumental).
 * - O volume é controlado por um GainNode do Web Audio: no iOS o `volume` do <audio> é somente leitura.
 * - Sem arquivo (ou com o navegador bloqueando), um relógio virtual mantém a abertura sincronizada.
 */
class AudioDirector {
  private el: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private bins: Uint8Array<ArrayBuffer> | null = null;
  private ready: Promise<boolean> | null = null;
  private virtualStart = 0;
  private usingVirtual = true;
  private ducked = false;
  available = false;

  /** Pré-carrega o arquivo. Resolve `true` se ele existe e já pode tocar. */
  preload(): Promise<boolean> {
    if (this.ready) return this.ready;
    this.ready = new Promise<boolean>((resolve) => {
      const el = new Audio();
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      el.src = AUDIO.src;
      const done = (ok: boolean) => {
        this.available = ok;
        resolve(ok);
      };
      el.addEventListener('canplay', () => done(true), { once: true });
      el.addEventListener('error', () => done(false), { once: true });
      el.addEventListener('ended', () => {
        el.currentTime = AUDIO.loopFrom;
        void el.play().catch(() => {});
      });
      // se nada responder em 12 s, a abertura segue no relógio virtual
      window.setTimeout(() => done(el.readyState >= 2), 12000);
      el.load();
      this.el = el;
    });
    return this.ready;
  }

  /** Chamado dentro do gesto do usuário ("aperte qualquer botão"). */
  async start() {
    this.virtualStart = performance.now() - AUDIO.startAt * 1000;
    this.usingVirtual = true;
    const el = this.el;
    if (!el || !this.available) return;

    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      const source = this.ctx.createMediaElementSource(el);
      this.gain = this.ctx.createGain();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;
      this.bins = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
      source.connect(this.gain).connect(this.analyser).connect(this.ctx.destination);

      const now = this.ctx.currentTime;
      const muted = experience.get().muted;
      this.gain.gain.setValueAtTime(0.0001, now);
      if (!muted) {
        // curva de potência constante: entra suave e chega cheia exatamente na virada
        const steps = 64;
        const curve = new Float32Array(steps);
        for (let i = 0; i < steps; i++) curve[i] = Math.max(0.0001, Math.sin((i / (steps - 1)) * Math.PI * 0.5) * AUDIO.volume);
        this.gain.gain.setValueCurveAtTime(curve, now + 0.02, AUDIO.dropAt - AUDIO.startAt);
      }

      el.currentTime = AUDIO.startAt;
      await this.ctx.resume();
      await el.play();
      this.usingVirtual = false;
    } catch {
      this.usingVirtual = true;
    }
  }

  /** Tempo da trilha em segundos (real ou virtual). */
  time(): number {
    if (!this.usingVirtual && this.el && !this.el.paused) return this.el.currentTime;
    return (performance.now() - this.virtualStart) / 1000;
  }

  setMuted(muted: boolean) {
    experience.set({ muted });
    try {
      localStorage.setItem('tqns:muted', muted ? '1' : '0');
    } catch {
      /* navegação privada */
    }
    this.applyLevel(0.6);
  }

  /** Abaixa a música enquanto o filme Alvi-Verde toca com som. */
  duck(on: boolean) {
    this.ducked = on;
    this.applyLevel(0.8);
  }

  private applyLevel(seconds: number) {
    if (!this.ctx || !this.gain) return;
    const target = experience.get().muted ? 0.0001 : this.ducked ? AUDIO.volume * 0.08 : AUDIO.volume;
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(Math.max(0.0001, this.gain.gain.value), now);
    this.gain.gain.exponentialRampToValueAtTime(target, now + seconds);
  }

  /** Níveis 0..1 para o medidor do HUD. */
  levels(out: number[]) {
    if (!this.analyser || !this.bins || experience.get().muted) {
      out.fill(0);
      return out;
    }
    this.analyser.getByteFrequencyData(this.bins);
    const per = Math.floor(this.bins.length / out.length);
    for (let i = 0; i < out.length; i++) {
      let sum = 0;
      for (let j = 0; j < per; j++) sum += this.bins[i * per + j];
      out[i] = sum / per / 255;
    }
    return out;
  }

  get playing() {
    return !this.usingVirtual;
  }
}

export const audio = new AudioDirector();
