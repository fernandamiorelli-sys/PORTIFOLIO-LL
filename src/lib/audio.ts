import { AUDIO } from '../data/site';
import { experience } from './store';

/** gestos que o navegador aceita para liberar o som (o pointerup cobre o toque; o clique e a tecla, o resto) */
const RETRY_EVENTS = ['pointerup', 'click', 'keydown'] as const;

/**
 * Diretor de áudio da exposição.
 * - A música começa em AUDIO.startAt com fade-in e estabiliza em AUDIO.dropAt (a virada do instrumental).
 * - O volume é controlado por um GainNode do Web Audio: no iOS o `volume` do <audio> é somente leitura.
 * - Sem arquivo (ou com o navegador bloqueando), um relógio virtual mantém a abertura sincronizada.
 * - O navegador só deixa tocar dentro de um gesto do visitante. Se ele recusar (o gesto não valeu), a
 *   música tenta de novo no próximo toque, clique ou tecla, e também ao ligar o som no HUD.
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
  /** esperando o próximo gesto para tentar tocar de novo */
  private retrying = false;
  available = false;

  /** Pré-carrega o arquivo. Resolve `true` se ele existe e já pode tocar. */
  preload(): Promise<boolean> {
    if (this.ready) return this.ready;
    this.ready = new Promise<boolean>((resolve) => {
      const el = new Audio();
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      // Opus (WebM) é menor; o MP3 cobre os navegadores sem Opus
      el.src = `${AUDIO.src}.${el.canPlayType('audio/webm; codecs="opus"') ? 'webm' : 'mp3'}`;
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        resolve(this.available);
      };
      const can = (ok: boolean) => {
        this.available = ok;
        experience.set({ sound: ok });
      };
      // a trilha pode ficar pronta depois que a abertura parou de esperar: aí o botão de som aparece
      el.addEventListener('canplay', () => (can(true), settle()), { once: true });
      el.addEventListener('error', () => (can(false), settle()), { once: true });
      el.addEventListener('ended', () => {
        el.currentTime = AUDIO.loopFrom;
        void el.play().catch(() => {});
      });
      // a entrada não espera mais que 5 s pela trilha: numa conexão lenta, a abertura segue no relógio
      // virtual e a música entra quando chegar (no ponto em que a abertura estiver)
      window.setTimeout(() => {
        if (!settled && el.readyState >= 2) can(true);
        settle();
      }, 5000);
      el.load();
      this.el = el;
    });
    return this.ready;
  }

  /**
   * Chamado dentro do gesto do visitante ("aperte qualquer botão"). Tudo o que o navegador só libera
   * com o gesto (criar e retomar o contexto, dar play) acontece aqui, na hora: esperar qualquer coisa
   * antes (um `await`) faz o Safari esquecer o gesto e recusar a música.
   */
  start() {
    if (this.ctx) return;
    this.virtualStart = performance.now() - AUDIO.startAt * 1000;
    this.usingVirtual = true;
    const el = this.el;
    // ainda carregando também serve: o play começa assim que houver o bastante
    if (!el || el.error) return;

    try {
      // no iPhone, a chave de silêncio cala o Web Audio: a trilha toca como mídia, igual a um vídeo
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'playback';
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
      this.ctx.addEventListener('statechange', () => this.ctx?.state === 'running' && this.playing && this.stopRetry());
      this.play();
      this.watchVisibility();
    } catch {
      this.usingVirtual = true;
    }
  }

  /** Dá play e retoma o contexto, sem esperar entre os dois (os dois precisam do gesto). Se o navegador
   *  recusar, tenta de novo no próximo gesto. */
  private play() {
    const el = this.el;
    const ctx = this.ctx;
    if (!el || !ctx) return;
    const playing = Promise.resolve(el.play());
    ctx.resume().catch(() => {});
    playing.then(
      () => {
        // a música chegou atrasada (conexão lenta ou gesto recusado): entra no ponto em que a abertura já
        // está, sem voltar no tempo; se esse ponto passou do fim da faixa, recomeça da virada, como no laço
        const target = (performance.now() - this.virtualStart) / 1000;
        if (this.usingVirtual && target - el.currentTime > 0.25) {
          const end = Number.isFinite(el.duration) ? el.duration : Infinity;
          el.currentTime = target < end - 1 ? target : AUDIO.loopFrom;
        }
        this.usingVirtual = false;
        // tocando, mas com o contexto ainda suspenso, não sai som: espera mais um gesto para retomá-lo
        if (ctx.state === 'running') this.stopRetry();
        else this.armRetry();
      },
      () => this.armRetry(),
    );
  }

  private retry = () => this.play();

  private armRetry() {
    if (this.retrying) return;
    this.retrying = true;
    for (const type of RETRY_EVENTS) window.addEventListener(type, this.retry, true);
  }

  private stopRetry() {
    if (!this.retrying) return;
    this.retrying = false;
    for (const type of RETRY_EVENTS) window.removeEventListener(type, this.retry, true);
  }

  /** Aba em segundo plano: a música some em fade e volta de onde parou. */
  private watchVisibility() {
    document.addEventListener('visibilitychange', () => {
      const el = this.el;
      if (!el || !this.ctx || !this.gain) return;
      if (document.hidden) {
        const now = this.ctx.currentTime;
        this.gain.gain.cancelScheduledValues(now);
        this.gain.gain.setValueAtTime(Math.max(0.0001, this.gain.gain.value), now);
        this.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
        window.setTimeout(() => document.hidden && el.pause(), 420);
      } else {
        void el.play().catch(() => {});
        this.applyLevel(0.8);
      }
    });
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
    // ligar o som é um gesto: se a música ainda não saiu (o navegador recusou antes), sai agora
    if (!muted) {
      if (!this.ctx) this.start();
      else if (!this.playing || this.ctx.state !== 'running') this.play();
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
