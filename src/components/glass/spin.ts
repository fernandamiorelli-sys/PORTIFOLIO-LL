// O giro do calango de vidro: devagar e sempre no mesmo eixo (o vertical, que passa pelo centro da
// peça). Ela não sai do lugar; só gira. A interação segue os padrões que o 21st.dev usa para objetos
// que respondem ao ponteiro: o Interactive Globe (giro lento automático quando ninguém mexe, arrastar
// com o ponteiro capturado gira a peça, o giro automático volta ao soltar) e os cartões de inclinação
// (Tilt, Optimized Tilt Card: mola na direção do cursor, um brilho que acompanha o ponteiro, toque
// segurado no celular). Por conta própria: a inércia ao soltar e a peça que vira de frente para quem
// passa o cursor.

/** giro automático: uma volta a cada 32 s */
export const SPIN = (Math.PI * 2) / 32;
/** de frente, um pouco virada (3/4): é para onde ela se vira quando o cursor chega */
export const FRONT = -0.22;
const TAU = Math.PI * 2;

/** aproxima `v` de `to` com constante de tempo `tau` (s), independente da taxa de quadros */
const approach = (v: number, to: number, dt: number, tau: number) => to + (v - to) * Math.exp(-dt / tau);

export class Spin {
  /** ângulo em torno do eixo vertical (rad) e velocidade (rad/s) */
  angle = FRONT - 0.5;
  vel = SPIN;
  /** inclinação para o cursor (rad, em torno do eixo horizontal) e a velocidade da mola */
  tilt = 0;
  private tiltVel = 0;
  /** 0..1: o quanto o cursor está sobre a peça (suavizado) */
  hover = 0;
  /** ponteiro em relação ao centro da peça (-1..1) e a luz que o segue */
  light = { x: 0, y: 0, amount: 0 };
  /** movimento reduzido: sem giro automático e sem mola; arrastar continua valendo */
  reduced = false;

  private over = false;
  private px = 0;
  private py = 0;
  private dragging = false;
  private dragX = 0;
  private dragAngle = 0;
  private dragSamples: { x: number; t: number }[] = [];
  /** rad por px de arrasto (arrastar a largura da peça na tela gira quase um terço de volta) */
  private perPx = 0.006;
  /** girando por conta de um arremesso (até frear, a mola do cursor espera) */
  private flung = false;

  /** o ponteiro passou (ou saiu) por cima da peça; px, py: posição relativa ao centro (-1..1) */
  pointer(over: boolean, px: number, py: number) {
    this.over = over;
    if (over || this.dragging) {
      this.px = Math.max(-1, Math.min(1, px));
      this.py = Math.max(-1, Math.min(1, py));
    }
  }

  /** começa a arrastar (x em px da tela; width: largura da peça na tela) */
  down(x: number, width: number, t: number) {
    this.dragging = true;
    this.dragX = x;
    this.dragAngle = this.angle;
    this.perPx = (Math.PI * 0.6) / Math.max(80, width);
    this.dragSamples = [{ x, t }];
  }

  move(x: number, t: number) {
    if (!this.dragging) return;
    this.angle = this.dragAngle + (x - this.dragX) * this.perPx;
    this.dragSamples.push({ x, t });
    while (this.dragSamples.length > 2 && t - this.dragSamples[0].t > 0.12) this.dragSamples.shift();
  }

  /** solta: a peça segue girando com a velocidade do arremesso e freia sozinha */
  up(t: number) {
    if (!this.dragging) return;
    this.dragging = false;
    const a = this.dragSamples[0];
    const b = this.dragSamples[this.dragSamples.length - 1];
    const dt = Math.max(0.016, b.t - a.t);
    // um arrasto parado (sem arremesso) solta sem velocidade
    const v = t - b.t > 0.08 ? 0 : ((b.x - a.x) / dt) * this.perPx;
    this.vel = this.reduced ? 0 : Math.max(-6, Math.min(6, v));
    this.flung = Math.abs(this.vel) > 1.6;
  }

  get isDragging() {
    return this.dragging;
  }

  step(dt: number) {
    dt = Math.min(dt, 0.1);
    const engaged = this.over || this.dragging;
    this.hover = approach(this.hover, engaged ? 1 : 0, dt, 0.18);
    // a luz segue o ponteiro (com um pouco de atraso) e acende só com ele em cima
    this.light.x = approach(this.light.x, this.px, dt, 0.08);
    this.light.y = approach(this.light.y, this.py, dt, 0.08);
    this.light.amount = approach(this.light.amount, engaged ? 1 : 0, dt, 0.22);

    if (this.flung && Math.abs(this.vel) < 1.6) this.flung = false;
    if (this.dragging) {
      // o ângulo vem do arrasto (move); aqui só a inclinação acompanha o dedo
    } else if (this.over && !this.flung && !this.reduced) {
      // cursor em cima e sem arremesso em curso: a peça vira de frente para o visitante e acompanha
      // o cursor de um lado para o outro (mola criticamente amortecida, sem quicar)
      const front = Math.round((this.angle - FRONT) / TAU) * TAU + FRONT;
      const target = front + this.px * 0.55;
      const w = 5.5;
      this.vel += (w * w * (target - this.angle) - 2 * w * this.vel) * dt;
      // vira sem pressa, mesmo quando está de costas (meia volta leva ~1,5 s)
      this.vel = Math.max(-2.2, Math.min(2.2, this.vel));
      this.angle += this.vel * dt;
    } else {
      // livre: o arremesso freia aos poucos e o giro lento volta
      const to = this.reduced ? 0 : this.over ? 0 : SPIN;
      this.vel = this.flung ? this.vel * Math.exp(-dt * 1.4) : approach(this.vel, to, dt, 0.6);
      this.angle += this.vel * dt;
    }

    // inclinação para o cursor (de cima ou de baixo), com mola
    const tiltTo = engaged && !this.reduced ? this.py * 0.3 : 0;
    const k = 7;
    this.tiltVel += (k * k * (tiltTo - this.tilt) - 2 * k * this.tiltVel) * dt;
    this.tilt += this.tiltVel * dt;
  }
}
