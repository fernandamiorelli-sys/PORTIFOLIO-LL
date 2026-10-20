import * as THREE from 'three';
import type { CalangoAsset, LimbKey } from './asset';

// Animação procedural do calango.
// O pescoço é o "líder": ele anda (direção e velocidade). O corpo é uma corrente de juntas
// (pescoço → peito → tronco → pelve → cauda) arrastada pelo líder, com o limite de flexão de cada
// vértebra: o corpo curva como o de um lagarto, nunca dobra ao meio. Por cima, a onda estacionária
// lateral da marcha. As patas pisam no chão e só se movem em passos (pares diagonais, como no trote),
// resolvidas por IK de dois ossos. E ainda: flexões de exibição territorial, cabeça que olha em
// sacadas, piscadas, a cauda que se acomoda e estremece.
// Posições em px de "chão"; o esqueleto está em unidades de CRC (escala = px por CRC).

const HALF_PI = Math.PI / 2;
const TAU = Math.PI * 2;

const wrap = (a: number) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (t: number) => t * t * (3 - 2 * t);

const Z = new THREE.Vector3(0, 0, 1);
const X = new THREE.Vector3(1, 0, 0);
const qz = (a: number, out = new THREE.Quaternion()) => out.setFromAxisAngle(Z, a);
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** Amostra uma polilinha por comprimento de arco (extrapola reto nas pontas). */
function samplePolyline(p: THREE.Vector2[], s: number, out: THREE.Vector2) {
  if (s <= 0 && p.length > 1) {
    const d = new THREE.Vector2().subVectors(p[0], p[1]).normalize();
    return out.copy(p[0]).addScaledVector(d, -s);
  }
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const d = p[i].distanceTo(p[i - 1]);
    if (acc + d >= s) {
      const t = d > 1e-9 ? (s - acc) / d : 0;
      return out.copy(p[i - 1]).lerp(p[i], t);
    }
    acc += d;
  }
  const n = p.length;
  const dir = new THREE.Vector2().subVectors(p[n - 1], p[n - 2]).normalize();
  return out.copy(p[n - 1]).addScaledVector(dir, s - acc);
}

// juntas da corrente, do pescoço à ponta da cauda (y de repouso, em CRC)
const CHAIN_Y = [0.71, 0.63, 0.46, 0.28, 0.1, -0.05, -0.18, -0.33, -0.49, -0.65, -0.82, -0.99, -1.15, -1.31, -1.5];
// flexão máxima de cada junta em relação ao segmento da frente (rad): tronco rígido, cauda solta
const CHAIN_BEND = [0, 0.62, 0.3, 0.3, 0.3, 0.42, 0.4, 0.4, 0.4, 0.42, 0.44, 0.46, 0.48, 0.5, 0.5];
const NECK = 0;
const CHEST = 1;
const PELVIS = 4;
const TAIL0 = 5;

/** O corpo como corrente: cada junta segue a da frente a uma distância fixa, com flexão limitada. */
class Chain {
  pts: THREE.Vector2[] = CHAIN_Y.map(() => new THREE.Vector2());
  reset(neck: THREE.Vector2, heading: number, svl: number) {
    const back = new THREE.Vector2(-Math.cos(heading), -Math.sin(heading));
    this.pts.forEach((p, i) => p.copy(neck).addScaledVector(back, (CHAIN_Y[0] - CHAIN_Y[i]) * svl));
  }
  /** Arrasta a corrente atrás do líder (já posicionado em pts[0]). */
  follow(heading: number, svl: number) {
    let prevDir = new THREE.Vector2(Math.cos(heading), Math.sin(heading));
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1];
      const b = this.pts[i];
      const len = (CHAIN_Y[i - 1] - CHAIN_Y[i]) * svl;
      let dir = new THREE.Vector2().subVectors(a, b);
      if (dir.lengthSq() < 1e-9) dir.copy(prevDir);
      dir.normalize();
      // limita a flexão em relação ao segmento da frente
      const ang = Math.atan2(prevDir.x * dir.y - prevDir.y * dir.x, prevDir.dot(dir));
      const lim = CHAIN_BEND[i];
      if (Math.abs(ang) > lim) {
        const c = Math.cos(Math.sign(ang) * lim);
        const s = Math.sin(Math.sign(ang) * lim);
        dir = new THREE.Vector2(prevDir.x * c - prevDir.y * s, prevDir.x * s + prevDir.y * c);
      }
      b.copy(a).addScaledVector(dir, -len);
      prevDir = dir;
    }
  }
  translate(dx: number, dy: number) {
    for (const p of this.pts) {
      p.x += dx;
      p.y += dy;
    }
  }
  rotate(cx: number, cy: number, a: number) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (const p of this.pts) {
      const x = p.x - cx;
      const y = p.y - cy;
      p.set(cx + x * c - y * s, cy + x * s + y * c);
    }
  }
}

interface Foot {
  key: LimbKey;
  pair: 0 | 1;
  planted: THREE.Vector2;
  from: THREE.Vector2;
  to: THREE.Vector2;
  t: number;
  dur: number;
  swinging: boolean;
  /** posição de repouso do punho/tornozelo em relação à junta do ombro/quadril (CRC) */
  offset: THREE.Vector2;
  restZ: number;
  lengths: [number, number];
  /** alvo fixo (pose do logo) */
  pin: THREE.Vector2 | null;
}

export interface LogoPose {
  /** espinha do desenho, do focinho à ponta da cauda, em px de chão */
  spine: THREE.Vector2[];
  /** onde ficam as quatro patas no desenho (px de chão) */
  feet: Partial<Record<LimbKey, THREE.Vector2>>;
}

export type RigMode = 'live' | 'logo';

export class CalangoRig {
  readonly bones: THREE.Bone[];
  private asset: CalangoAsset;
  private idx: Record<string, number>;
  /** pelve → spine1 → spine2 → peito → pescoço → cabeça */
  private axial: number[];
  private tail: number[];
  readonly chain = new Chain();
  /** líder: junta do pescoço, em px de chão */
  readonly pos = new THREE.Vector2();
  heading = HALF_PI;
  speed = 0;
  svl = 160;
  mode: RigMode = 'live';
  maxSpeed = 7.5; // CRC/s
  target = new THREE.Vector2();
  idleHeading: number | null = null;
  look: THREE.Vector2 | null = null;
  idleTime = 0;

  private feet: Foot[];
  private activePair: 0 | 1 = 0;
  private phase = 0;
  private lift = 0;
  private turning = false;
  private lookYaw = 0;
  private lookYawTarget = 0;
  private lookPitch = 0;
  private nextSaccade = 0;
  private pushup = 0;
  private pushupT = -1;
  private pushupReps = 3;
  private nextPushup = 5;
  private blinkT = -1;
  private nextBlink = 2;
  private twitchT = -1;
  private nextTwitch = 5;
  private calm = 0;
  private tailCurl = 0;
  private tailCurlTarget = 0.25;
  private nextCurl = 2;
  private eyeLids: THREE.Object3D[] = [];
  private ready = false;
  private blend: { from: THREE.Vector2[]; to: THREE.Vector2[]; t: number; dur: number; heading: number } | null = null;

  constructor(asset: CalangoAsset, bones: THREE.Bone[]) {
    this.asset = asset;
    this.bones = bones;
    this.idx = asset.boneIndex;
    const i = this.idx;
    this.axial = [i.pelvis, i.spine1, i.spine2, i.chest, i.neck, i.head];
    this.tail = Array.from({ length: 9 }, (_, k) => i[`tail${k}`]);
    const r = asset.rest;
    const L = asset.header.limbs;
    const mk = (key: LimbKey, pair: 0 | 1): Foot => {
      const [a, b, c] = L[key];
      return {
        key,
        pair,
        planted: new THREE.Vector2(),
        from: new THREE.Vector2(),
        to: new THREE.Vector2(),
        t: 0,
        dur: 0.2,
        swinging: false,
        offset: new THREE.Vector2(r[c].x - r[a].x, r[c].y - r[a].y),
        restZ: r[c].z,
        lengths: [r[b].distanceTo(r[a]), r[c].distanceTo(r[b])],
        pin: null,
      };
    };
    // pares diagonais do trote: (anterior esquerda + posterior direita) e (anterior direita + posterior esquerda)
    this.feet = [mk('front.L', 0), mk('hind.R', 0), mk('front.R', 1), mk('hind.L', 1)];
  }

  attachLids(lids: THREE.Object3D[]) {
    this.eyeLids = lids;
  }

  /** Coloca o calango parado num ponto, já com as patas no chão. */
  place(x: number, y: number, heading: number, svl: number) {
    this.svl = svl;
    this.pos.set(x, y);
    this.heading = heading;
    this.speed = 0;
    this.target.set(x, y);
    this.chain.reset(this.pos, heading, svl);
    this.ready = false;
  }

  /**
   * Entra na pose do desenho (o mascote minimalista) ou sai dela.
   * Com `blend`, o corpo desliza da pose atual até a do desenho nesse tempo (s).
   */
  setLogoPose(pose: LogoPose | null, blend = 0) {
    if (!pose) {
      this.mode = 'live';
      this.blend = null;
      for (const f of this.feet) f.pin = null;
      this.idleTime = 0;
      return;
    }
    this.mode = 'logo';
    const svl = this.svl;
    // juntas sobre a espinha do desenho, a partir do focinho (o focinho fica a 1 − 0,71 CRC do pescoço)
    const to = CHAIN_Y.map((y) => samplePolyline(pose.spine, (1 - y) * svl, new THREE.Vector2()));
    const ahead = samplePolyline(pose.spine, (1 - CHAIN_Y[0] - 0.1) * svl, new THREE.Vector2());
    const heading = Math.atan2(ahead.y - to[0].y, ahead.x - to[0].x);
    if (blend > 0 && this.ready) {
      this.blend = { from: this.chain.pts.map((p) => p.clone()), to, t: 0, dur: blend, heading };
    } else {
      this.blend = null;
      this.chain.pts.forEach((p, i) => p.copy(to[i]));
      this.pos.copy(to[0]);
      this.heading = heading;
    }
    this.speed = 0;
    for (const f of this.feet) f.pin = pose.feet[f.key]?.clone() ?? null;
  }

  get posing() {
    return this.mode === 'logo' && !this.blend;
  }

  /** Muda a escala (px por CRC) mantendo a pose: corpo e patas escalam em torno do líder. */
  rescale(svl: number) {
    if (Math.abs(svl - this.svl) < 1e-3) return;
    const k = svl / this.svl;
    const c = this.pos;
    for (const p of this.chain.pts) p.sub(c).multiplyScalar(k).add(c);
    for (const f of this.feet) {
      f.planted.sub(c).multiplyScalar(k).add(c);
      f.from.sub(c).multiplyScalar(k).add(c);
      f.to.sub(c).multiplyScalar(k).add(c);
    }
    this.svl = svl;
  }

  /** A inclinação mudou: as coordenadas de chão em y esticam para a tela não pular. */
  stretchY(k: number) {
    if (Math.abs(k - 1) < 1e-5) return;
    const cy = this.pos.y;
    this.pos.y *= k;
    this.target.y *= k;
    // o corpo não estica: só acompanha o líder
    const dy = this.pos.y - cy;
    this.chain.translate(0, dy);
    for (const f of this.feet) {
      f.planted.y += dy;
      f.from.y += dy;
      f.to.y += dy;
    }
  }

  /** Arrasta o calango junto com a página (a âncora se moveu na tela). */
  carry(dx: number, dy: number) {
    if (!dx && !dy) return;
    this.pos.x += dx;
    this.pos.y += dy;
    this.target.x += dx;
    this.target.y += dy;
    this.chain.translate(dx, dy);
    for (const f of this.feet) {
      f.planted.x += dx;
      f.planted.y += dy;
      f.from.x += dx;
      f.from.y += dy;
      f.to.x += dx;
      f.to.y += dy;
    }
  }

  startle(away: THREE.Vector2, distance: number) {
    const dir = new THREE.Vector2().subVectors(this.pos, away).normalize();
    this.target.copy(this.pos).addScaledVector(dir, distance);
    this.calm = 1.6;
  }

  display() {
    if (this.pushupT < 0) {
      this.pushupT = 0;
      this.pushupReps = 2 + Math.floor(Math.random() * 3);
    }
  }

  /** fugindo do cursor: o alvo de passeio espera */
  get fleeing() {
    return this.calm > 0;
  }

  get resting() {
    return this.speed < 0.15 * this.svl && this.idleTime > 0.4;
  }

  /** Avança a simulação e escreve as rotações nos ossos. */
  update(dt: number, opts: { reduced: boolean; rootObject: THREE.Object3D }) {
    const svl = this.svl;

    // ── locomoção (modo vivo)
    if (this.mode === 'live') {
      const tx = this.target.x - this.pos.x;
      const ty = this.target.y - this.pos.y;
      const dist = Math.hypot(tx, ty);
      const stopR = 0.06 * svl;
      let desired = this.heading;
      let want = 0;
      if (dist > stopR) {
        desired = Math.atan2(ty, tx);
        // chegada suave + arrancadas: lagarto anda aos trancos
        const decel = 26 * svl;
        want = Math.min(this.maxSpeed * svl, Math.sqrt(2 * decel * (dist - stopR)));
        if (dist < 0.5 * svl) want = Math.min(want, 2.2 * svl);
      } else if (this.idleHeading !== null) {
        desired = this.idleHeading;
      } else if (this.look && this.resting) {
        const lx = this.look.x - this.pos.x;
        const ly = this.look.y - this.pos.y;
        if (Math.hypot(lx, ly) > 0.5 * svl) desired = Math.atan2(ly, lx);
      }
      let diff = wrap(desired - this.heading);
      const moving = want > 0.2 * svl || this.speed > 0.6 * svl;
      if (moving) {
        // andando: o pescoço vira e o corpo segue em curva
        const maxTurn = 4.6 * dt;
        this.heading = wrap(this.heading + clamp(diff, -maxTurn, maxTurn));
        // alvo muito para trás: primeiro gira no lugar
        if (Math.abs(diff) > 1.9) want = 0;
      }
      if ((!moving || want === 0) && Math.abs(diff) > (this.turning ? 0.06 : 0.7)) {
        // parado: o corpo inteiro gira sobre o meio do tronco, aos passinhos (as patas acompanham)
        this.turning = true;
        const step = clamp(diff, -2.6 * dt, 2.6 * dt);
        const pivot = this.chain.pts[2].clone();
        this.chain.rotate(pivot.x, pivot.y, step);
        this.pos.copy(this.chain.pts[NECK]);
        this.heading = wrap(this.heading + step);
        diff = wrap(desired - this.heading);
      } else if (Math.abs(diff) <= 0.06) this.turning = false;
      const facing = Math.cos(diff);
      const target = want * clamp(facing, 0.12, 1);
      const acc = (target > this.speed ? 34 : 30) * svl;
      this.speed += clamp(target - this.speed, -acc * dt, acc * dt);
      this.pos.x += Math.cos(this.heading) * this.speed * dt;
      this.pos.y += Math.sin(this.heading) * this.speed * dt;
      this.chain.pts[NECK].copy(this.pos);
      this.chain.follow(this.heading, svl);
      if (this.speed < 0.15 * svl) this.idleTime += dt;
      else this.idleTime = 0;
      if (this.calm > 0) this.calm -= dt;
    } else {
      this.speed = 0;
      this.idleTime += dt;
      const b = this.blend;
      if (b) {
        b.t += dt / b.dur;
        const e = smooth(Math.min(1, b.t));
        this.chain.pts.forEach((p, i) => p.copy(b.from[i]).lerp(b.to[i], e));
        this.pos.copy(this.chain.pts[NECK]);
        this.heading = wrap(this.heading + wrap(b.heading - this.heading) * Math.min(1, dt * 6 + e * e));
        if (b.t >= 1) {
          this.heading = b.heading;
          this.blend = null;
        }
      }
    }
    const speedK = clamp(this.speed / (this.maxSpeed * svl), 0, 1);

    // ── comportamentos de quem está parado
    if (!opts.reduced) {
      if (this.mode === 'live' && this.resting && this.pushupT < 0 && this.calm <= 0) {
        this.nextPushup -= dt;
        if (this.nextPushup <= 0) {
          this.display();
          this.nextPushup = 7 + Math.random() * 9;
        }
      }
      this.nextBlink -= dt;
      if (this.nextBlink <= 0 && this.blinkT < 0) {
        this.blinkT = 0;
        this.nextBlink = 2.2 + Math.random() * 5;
      }
      if (this.resting && this.twitchT < 0) {
        this.nextTwitch -= dt;
        if (this.nextTwitch <= 0) {
          this.twitchT = 0;
          this.nextTwitch = 3 + Math.random() * 6;
        }
      }
      this.nextCurl -= dt;
      if (this.nextCurl <= 0) {
        this.tailCurlTarget = (Math.random() - 0.5) * 1.2;
        this.nextCurl = 4 + Math.random() * 6;
      }
    }
    // flexões: sobe rápido, desce, repete
    let push = 0;
    if (this.pushupT >= 0) {
      this.pushupT += dt;
      const k = this.pushupT / 0.42;
      if (k >= this.pushupReps) this.pushupT = -1;
      else {
        const f = k % 1;
        push = f < 0.35 ? smooth(f / 0.35) : 1 - smooth((f - 0.35) / 0.65);
      }
    }
    this.pushup += (push - this.pushup) * (1 - Math.exp(-dt * 30));
    // piscada: uma casca um pouco maior que o olho cobre o vidro por um instante
    let blink = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const b = this.blinkT;
      blink = b < 0.07 ? b / 0.07 : b < 0.12 ? 1 : b < 0.26 ? 1 - (b - 0.12) / 0.14 : 0;
      if (b > 0.26) this.blinkT = -1;
    }
    for (const lid of this.eyeLids) {
      lid.visible = blink > 0.02;
      lid.scale.setScalar(0.9 + 0.1 * blink);
    }
    let twitch = 0;
    if (this.twitchT >= 0) {
      this.twitchT += dt;
      twitch = Math.sin(this.twitchT * 22) * Math.exp(-this.twitchT * 5) * 0.5;
      if (this.twitchT > 1) this.twitchT = -1;
    }
    const restK = this.mode === 'live' && this.speed < 0.4 * svl ? 1 : 0;
    this.tailCurl += (this.tailCurlTarget * restK - this.tailCurl) * (1 - Math.exp(-dt * 0.9));

    // cabeça: olha em sacadas (lagartos não giram a cabeça suavemente)
    if (this.mode === 'live' && this.look) {
      const ang = Math.atan2(this.look.y - this.pos.y, this.look.x - this.pos.x);
      const rel = clamp(wrap(ang - this.heading), -1.0, 1.0);
      this.nextSaccade -= dt;
      if (Math.abs(rel - this.lookYawTarget) > 0.22 || this.nextSaccade <= 0) {
        this.lookYawTarget = rel;
        this.nextSaccade = 0.6 + Math.random() * 1.6;
      }
    } else if (this.mode === 'live') {
      this.nextSaccade -= dt;
      if (this.nextSaccade <= 0) {
        this.lookYawTarget = (Math.random() - 0.5) * 1.1;
        this.nextSaccade = 0.8 + Math.random() * 2.2;
      }
    } else this.lookYawTarget = 0;
    this.lookYaw += (this.lookYawTarget - this.lookYaw) * (1 - Math.exp(-dt * (this.speed > 0.5 * svl ? 8 : 26)));
    this.lookPitch += ((this.pushup > 0.01 ? -0.12 : 0.05) - this.lookPitch) * (1 - Math.exp(-dt * 10));

    // ── direções do corpo a partir da corrente
    const C = this.chain.pts;
    const yawOf = (a: THREE.Vector2, b: THREE.Vector2) => Math.atan2(b.y - a.y, b.x - a.x);
    const amp = this.mode === 'live' ? 0.2 * Math.min(1, this.speed / (1.5 * svl)) : 0;
    const wave = Math.sin(this.phase) * amp;
    // ossos axiais (cada um aponta da sua junta para a da frente): pelve, spine1, spine2, peito, pescoço
    const fwdYaw = [yawOf(C[PELVIS], C[3]), yawOf(C[3], C[2]), yawOf(C[2], C[1]), yawOf(C[CHEST], C[NECK]), this.heading];
    // onda estacionária: cinturas giram em sentidos opostos, sincronizadas com o passo
    fwdYaw[0] += wave;
    fwdYaw[1] += wave * 0.35;
    fwdYaw[2] -= wave * 0.35;
    fwdYaw[3] -= wave;
    fwdYaw[4] -= wave * 0.4;
    // cauda: de cada junta para a seguinte (para trás)
    const tailYaw: number[] = [];
    for (let k = 0; k < this.tail.length; k++) {
      let y = yawOf(C[TAIL0 + k], C[TAIL0 + k + 1]);
      y += Math.sin(this.phase - k * 0.7) * amp * 0.6 * (0.4 + k / this.tail.length);
      if (k >= 5) y += twitch * (k - 4) * 0.35;
      y += this.tailCurl * (k / this.tail.length) * 0.5;
      tailYaw.push(y);
    }

    // altura e inclinação: em marcha o corpo sobe do chão; na flexão, a frente sobe
    const liftTarget = this.mode === 'live' ? 0.012 + 0.016 * Math.min(1, this.speed / (1.2 * svl)) : 0;
    this.lift += (liftTarget - this.lift) * (1 - Math.exp(-dt * 6));
    const push01 = this.pushup;
    const pelvisPitch = push01 * 0.2;

    // ── ossos axiais (rotações relativas ao pai)
    const bones = this.bones;
    const r = this.asset.rest;
    const ix = this.idx;
    const pelvis = bones[ix.pelvis];
    pelvis.position.set(C[PELVIS].x / svl, C[PELVIS].y / svl, r[ix.pelvis].z + this.lift + push01 * 0.012);
    const worldQ: THREE.Quaternion[] = [];
    worldQ[0] = qz(fwdYaw[0] - HALF_PI).multiply(_q.setFromAxisAngle(X, pelvisPitch));
    pelvis.quaternion.copy(worldQ[0]);
    for (let k = 1; k < this.axial.length; k++) {
      const b = bones[this.axial[k]];
      let pitch = 0;
      let yaw: number;
      if (k < 5) yaw = fwdYaw[k] - HALF_PI;
      else yaw = fwdYaw[4] - HALF_PI + this.lookYaw;
      if (k === 3) pitch = push01 * 0.06;
      if (k === 4) {
        pitch = -push01 * 0.1 + this.lookPitch * 0.3;
        yaw += this.lookYaw * 0.4;
      }
      if (k === 5) pitch = -push01 * 0.16 + this.lookPitch + Math.sin(this.pushupT * 15) * 0.05 * push01;
      const wq = qz(yaw).multiply(_q.setFromAxisAngle(X, pitch + pelvisPitch));
      worldQ[k] = wq;
      b.quaternion.copy(worldQ[k - 1]).invert().multiply(wq);
    }
    // cauda: o primeiro segmento desce até o chão se o corpo subiu; o resto fica no chão
    let parentQ = worldQ[0];
    for (let k = 0; k < this.tail.length; k++) {
      const b = bones[this.tail[k]];
      const drop = k === 0 ? Math.atan2(this.lift + push01 * 0.012, 0.13) : 0;
      // o repouso da cauda aponta para −y: girar de −y para o rumo = yaw + π/2
      const wq = qz(tailYaw[k] + HALF_PI).multiply(_q.setFromAxisAngle(X, drop));
      b.quaternion.copy(parentQ).invert().multiply(wq);
      parentQ = wq;
    }

    // ── patas
    opts.rootObject.updateMatrixWorld(true);
    const inv = _m.copy(opts.rootObject.matrixWorld).invert();
    const vel = new THREE.Vector2(Math.cos(this.heading), Math.sin(this.heading)).multiplyScalar(this.speed);
    let swingingPair = -1;
    for (const f of this.feet) if (f.swinging) swingingPair = f.pair;
    const stride = (0.11 + 0.1 * speedK) * svl;
    const swingDur = clamp(0.2 - speedK * 0.11, 0.075, 0.2);

    for (const f of this.feet) {
      const [a, bMid, c] = this.asset.header.limbs[f.key];
      const root = new THREE.Vector3().setFromMatrixPosition(bones[a].matrixWorld).applyMatrix4(inv);
      const front = f.key.startsWith('front');
      const gYaw = front ? fwdYaw[3] : fwdYaw[0];
      const rot = gYaw - HALF_PI;
      const cs = Math.cos(rot);
      const sn = Math.sin(rot);
      const ox = f.offset.x * cs - f.offset.y * sn;
      const oy = f.offset.x * sn + f.offset.y * cs;
      const home = new THREE.Vector2((root.x + ox) * svl, (root.y + oy) * svl).addScaledVector(vel, 0.11);

      if (!this.ready) {
        f.planted.copy(f.pin ?? home);
        f.swinging = false;
      }
      if (f.pin) {
        // pose do logo: a pata vai (em passo) até o ponto do desenho
        if (!f.swinging && f.planted.distanceTo(f.pin) > 0.01 * svl) {
          f.swinging = true;
          f.t = 0;
          f.dur = 0.22;
          f.from.copy(f.planted);
          f.to.copy(f.pin);
        }
      } else if (!f.swinging) {
        const far = f.planted.distanceTo(home);
        const need = far > stride || (this.resting && far > 0.035 * svl) || (this.turning && far > 0.05 * svl);
        if (need && (swingingPair === -1 || swingingPair === f.pair)) {
          // só um par por vez no ar; o par parceiro sai junto
          if (swingingPair === -1) {
            swingingPair = f.pair;
            this.activePair = f.pair;
          }
          f.swinging = true;
          f.t = 0;
          f.dur = swingDur;
          f.from.copy(f.planted);
        }
      }
      let lift = 0;
      const foot = new THREE.Vector2();
      if (f.swinging) {
        if (!f.pin) f.to.copy(home);
        f.t += dt / f.dur;
        foot.copy(f.from).lerp(f.to, smooth(Math.min(1, f.t)));
        lift = Math.sin(Math.min(1, f.t) * Math.PI) * (0.035 + 0.02 * speedK);
        if (f.t >= 1) {
          f.swinging = false;
          f.planted.copy(f.to);
        }
      } else foot.copy(f.planted);

      // IK de dois ossos
      const target = new THREE.Vector3(foot.x / svl, foot.y / svl, f.restZ + lift);
      const [la, lb] = f.lengths;
      const dvec = _v.subVectors(target, root);
      let d = dvec.length();
      const maxReach = (la + lb) * 0.995;
      if (d > maxReach) {
        dvec.multiplyScalar(maxReach / d);
        d = maxReach;
      }
      d = Math.max(d, Math.abs(la - lb) + 1e-4);
      const u = dvec.clone().normalize();
      // polo: cotovelo para trás e para cima; joelho para a frente e para cima; ambos para fora
      const fwd = new THREE.Vector3(Math.cos(gYaw), Math.sin(gYaw), 0);
      const side = new THREE.Vector3(Math.sin(gYaw), -Math.cos(gYaw), 0).multiplyScalar(f.key.endsWith('.R') ? 1 : -1);
      const pole = new THREE.Vector3()
        .addScaledVector(fwd, front ? -0.55 : 0.6)
        .addScaledVector(Z, 0.75)
        .addScaledVector(side, 0.45)
        .normalize();
      const x = (la * la - lb * lb + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, la * la - x * x));
      const vperp = pole.clone().addScaledVector(u, -pole.dot(u)).normalize();
      const elbow = root.clone().addScaledVector(u, x).addScaledVector(vperp, h);
      const wrist = root.clone().add(dvec);
      const restA = new THREE.Vector3().subVectors(r[bMid], r[a]).normalize();
      const q1 = new THREE.Quaternion().setFromUnitVectors(restA, elbow.clone().sub(root).normalize());
      const restB = new THREE.Vector3().subVectors(r[c], r[bMid]).normalize();
      const q2 = new THREE.Quaternion().setFromUnitVectors(restB, wrist.clone().sub(elbow).normalize());
      // mão/pé: chapado no chão, acompanhando o corpo; no ar, os dedos levantam um pouco
      const q3 = qz(rot).multiply(_q2.setFromAxisAngle(X, lift * (front ? 3 : -3)));
      const parentWorldQ = (front ? worldQ[3] : worldQ[0]).clone();
      bones[a].quaternion.copy(parentWorldQ.invert()).multiply(q1);
      bones[bMid].quaternion.copy(q1.clone().invert()).multiply(q2);
      bones[c].quaternion.copy(q2.clone().invert()).multiply(q3);
    }
    // fase da onda: avança com o par que está no ar
    if (swingingPair >= 0) {
      let prog = 0;
      let n = 0;
      for (const f of this.feet)
        if (f.swinging) {
          prog += Math.min(1, f.t);
          n++;
        }
      const target = (swingingPair === 0 ? 0 : Math.PI) + (n ? prog / n : 0) * Math.PI;
      this.phase += wrap(target - this.phase) * (1 - Math.exp(-dt * 30));
    } else this.phase += wrap((this.activePair === 0 ? Math.PI : 0) - this.phase) * (1 - Math.exp(-dt * 3));
    this.ready = true;
  }

  /** Posição (px de chão) de um osso, para o hit-test e para as partículas. */
  bonePosition(name: string, rootObject: THREE.Object3D, out: THREE.Vector3) {
    const b = this.bones[this.idx[name]];
    return out.setFromMatrixPosition(b.matrixWorld).applyMatrix4(_m.copy(rootObject.matrixWorld).invert()).multiplyScalar(this.svl);
  }
}
