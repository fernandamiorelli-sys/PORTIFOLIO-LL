import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, PerformanceMonitor } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { CALANGO_SPINE, CALANGO_VIEWBOX } from '../../assets/calango';
import { calangoBus } from '../../lib/calangoBus';
import { handoff } from '../../lib/handoff';
import { experience, isTouch, reducedMotion } from '../../lib/store';
import { AsciiCalango } from '../intro/asciiCalango';
import { loadCalango, makeSkeleton, type CalangoAsset, type LimbKey } from './calango/asset';
import { createCalangoMaterials } from './calango/material';
import { createParticles, glyphIndex } from './calango/particles';
import { CalangoRig, type LogoPose } from './calango/rig';

// Palco 3D fixo sobre a página (câmera ortográfica: 1 unidade = 1 px CSS).
// O calango é um animal de verdade andando sobre o "chão" da página: cada seção marca uma âncora
// (data-calango) e ele caminha até ela; enquanto a página rola, ele é carregado junto com a âncora.
//
// Atributos da âncora:
//   data-calango="id"                · nome
//   data-calango-mode="roam|stage|logo|home"
//                                      roam: passeia em volta · stage: em destaque, grande
//                                      logo: assume a pose do mascote (hero) · home: volta ao patch (fim)
//   data-calango-size="0.12"          · CRC em fração da altura da tela (ou "fit" para logo/home)
//   data-calango-size-m / -heading-m  · os mesmos, para telas estreitas (< 760 px)
//   data-calango-tilt="40"            · inclinação da vista em graus (0 = visto de cima)
//   data-calango-heading="90"         · rumo quando parado, em graus de tela (0 = para cima, 90 = direita)
//   data-calango-wander="0.6"         · raio do passeio, em CRC
//   data-calango-layer="front"        · passa na frente do conteúdo
//   data-calango-carry="false"        · a âncora é só um destino (não arrasta o calango quando se move)

const params = new URLSearchParams(location.search);
const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
// ?leve força o modo econômico (sem escamas nem sombra); ?alta força o completo.
// Fora isso: econômico em toque e em máquinas fracas; o monitor de desempenho rebaixa se precisar.
const lowPower = params.has('alta') ? false : params.has('leve') || isTouch || (navigator.hardwareConcurrency ?? 8) < 4 || memory < 4;
const DEG = Math.PI / 180;

type Mode = 'roam' | 'stage' | 'logo' | 'home';

interface Anchor {
  el: HTMLElement;
  id: string;
  mode: Mode;
  size: number | 'fit';
  tilt: number;
  heading: number | null;
  wander: number;
  front: boolean;
  /** a âncora é o chão (rolar a página carrega o calango) ou só um destino */
  carry: boolean;
}

function readAnchors(): Anchor[] {
  // em telas estreitas, a âncora pode pedir outro tamanho e outro rumo (data-calango-size-m, -heading-m)
  const narrow = window.innerWidth < 760;
  return Array.from(document.querySelectorAll<HTMLElement>('[data-calango]')).map((el) => {
    const d = el.dataset;
    const mode = (d.calangoMode as Mode) || 'roam';
    const sizeAttr = (narrow && d.calangoSizeM) || d.calangoSize;
    const headingAttr = (narrow && d.calangoHeadingM) || d.calangoHeading;
    const size = sizeAttr === 'fit' || mode === 'logo' || mode === 'home' ? 'fit' : Number(sizeAttr ?? 0.12);
    return {
      el,
      id: d.calango ?? '',
      mode,
      size,
      tilt: Number(d.calangoTilt ?? (mode === 'logo' || mode === 'home' ? 0 : 40)),
      heading: headingAttr != null ? Number(headingAttr) : null,
      wander: Number(d.calangoWander ?? 0.6),
      front: d.calangoLayer === 'front',
      carry: d.calangoCarry !== 'false',
    };
  });
}

// O desenho do mascote (viewBox 408 × 642): ponta do focinho + espinha + onde ficam as patas.
const LOGO_SNOUT: [number, number] = [323.7, 21.7];
const LOGO_FEET: Record<LimbKey, [number, number]> = {
  'front.L': [150, 140],
  'front.R': [345, 210],
  'hind.L': [75, 415],
  'hind.R': [300, 350],
};

function Studio() {
  // estúdio de cromo feito só de "lightformers" (nenhum HDR externo): fundo escuro e um anel de tiras de
  // luz em volta, em alturas diferentes. Assim, qualquer curva do corpo reflete alguma luz e alguma
  // sombra, de qualquer ângulo de vista, e o metal mantém o contraste que o faz parecer metal.
  const ring = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    const r = 9;
    return { pos: [Math.cos(a) * r, 2 + (i % 3) * 2.2, Math.sin(a) * r] as [number, number, number], strong: i % 2 === 0, warm: i % 3 === 1 };
  });
  return (
    <Environment resolution={lowPower ? 128 : 256} frames={1}>
      <mesh scale={40}>
        <sphereGeometry args={[1, 32, 16]} />
        <shaderMaterial
          side={THREE.BackSide}
          depthWrite={false}
          vertexShader={'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'}
          fragmentShader={
            'varying vec3 vP; void main(){ float up = smoothstep(-0.1, 1.0, vP.y); vec3 c = mix(vec3(0.012, 0.015, 0.013), vec3(0.11, 0.125, 0.118), up); c += vec3(0.05, 0.14, 0.06) * smoothstep(-0.35, -0.9, vP.y); gl_FragColor = vec4(c, 1.0); }'
          }
        />
      </mesh>
      {ring.map((l, i) => (
        <Lightformer key={i} form="rect" intensity={l.strong ? 5 : 2.2} color={l.warm ? '#e8e3d7' : '#ffffff'} position={l.pos} scale={[0.35, 7, 1]} target={[0, 0, 0]} />
      ))}
      {/* caixas amplas no alto: brilho largo no dorso (de cima e de frente) */}
      <Lightformer form="rect" intensity={2.4} color="#f2f5f1" position={[0, 9, 3]} scale={[10, 3, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={2} color="#f2f5f1" position={[2, 3, 9]} scale={[5, 2.2, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={1.6} color="#f2f5f1" position={[-1, 8, -5]} scale={[8, 2, 1]} target={[0, 0, 0]} />
      {/* contraluz verde do clube, rasante, e o azul-acinzentado da Gen X Soft Club */}
      <Lightformer form="rect" intensity={3} color="#7cd93b" position={[0, -9, 2]} scale={[14, 1.2, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={1.8} color="#6a7c96" position={[-9, -1, 1]} scale={[3, 8, 1]} target={[0, 0, 0]} />
      <Lightformer form="ring" intensity={2.4} color="#a8c4b0" position={[5, 7, 4]} scale={1.8} target={[0, 0, 0]} />
    </Environment>
  );
}

function CalangoActor({ asset, wrapperRef, high }: { asset: CalangoAsset; wrapperRef: RefObject<HTMLDivElement | null>; high: boolean }) {
  const { size } = useThree();
  const floorRef = useRef<THREE.Group>(null);
  const lizardRef = useRef<THREE.Group>(null);
  const shadowRef = useRef<THREE.Group>(null);
  const particlesRef = useRef<THREE.Group>(null);
  const anchors = useRef<Anchor[]>([]);

  const build = useMemo(() => {
    const mats = createCalangoMaterials({ scales: true });
    const bones = makeSkeleton(asset);
    bones[0].updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones);
    const mesh = new THREE.SkinnedMesh(asset.geometry, mats.body);
    mesh.add(bones[0]);
    mesh.bind(skeleton, new THREE.Matrix4());
    mesh.frustumCulled = false;
    // olhos de vidro preto e pálpebras, presos ao osso da cabeça
    const head = bones[asset.boneIndex.head];
    const headRest = asset.rest[asset.boneIndex.head];
    const lids: THREE.Mesh[] = [];
    for (const e of asset.header.eyes) {
      const c = new THREE.Vector3(...e.center).sub(headRest);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(e.radius, 32, 24), mats.eye);
      eye.position.copy(c);
      // a pupila (polo +Y da esfera) olha para fora da órbita
      eye.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...e.axis).normalize());
      eye.frustumCulled = false;
      head.add(eye);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(e.radius * 1.1, 28, 20), mats.lid);
      lid.position.copy(c);
      lid.visible = false;
      lid.frustumCulled = false;
      head.add(lid);
      lids.push(lid);
    }
    const rig = new CalangoRig(asset, bones);
    rig.attachLids(lids);
    return { mats, mesh, rig, lids };
  }, [asset]);

  const st = useRef({
    anchor: null as Anchor | null,
    anchorPos: new THREE.Vector2(),
    placed: false,
    tilt: 0,
    svl: 120,
    front: false,
    posedAt: '' as string,
    wanderAt: 0,
    wander: new THREE.Vector2(),
    pointer: new THREE.Vector2(-1e5, -1e5),
    pointerVel: 0,
    pointerT: -10,
    hover: false,
    particles: null as THREE.Points | null,
    particlesFor: '' as '' | 'hero' | 'home',
    carry: new THREE.Vector3(),
    reveal: 0,
    awake: false,
    cue: 0,
    frames: 0,
  });

  useEffect(() => {
    anchors.current = readAnchors();
    const refresh = window.setInterval(() => (anchors.current = readAnchors()), 1200);
    let last = { x: 0, y: 0, t: performance.now() };
    const onMove = (e: PointerEvent) => {
      const s = st.current;
      const now = performance.now();
      const dtp = Math.max(1, now - last.t) / 1000;
      s.pointerVel = Math.hypot(e.clientX - last.x, e.clientY - last.y) / dtp;
      last = { x: e.clientX, y: e.clientY, t: now };
      s.pointer.set(e.clientX, e.clientY);
      s.pointerT = now / 1000;
    };
    const onDown = () => {
      const s = st.current;
      if (s.hover && build.rig.mode === 'live') build.rig.display();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.clearInterval(refresh);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      experience.set({ cursor: null });
    };
  }, [build]);

  // depuração (só em desenvolvimento)
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__calango = { rig: build.rig, st: st.current, mats: build.mats, bus: calangoBus };
  }, [build]);

  // libera os recursos quando o palco desmonta
  useEffect(
    () => () => {
      build.mats.body.dispose();
      build.mats.eye.map?.dispose();
      build.mats.eye.dispose();
      build.mats.lid.dispose();
    },
    [build],
  );

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 20);
    const s = st.current;
    s.frames++;
    const rig = build.rig;
    const floor = floorRef.current;
    const lizard = lizardRef.current;
    if (!floor || !lizard) return;
    const vw = size.width;
    const vh = size.height;

    // ── âncora ativa: a mais perto do centro da tela (com histerese); a transformação não larga a âncora no meio
    let best: Anchor | null = null;
    let bestScore = Infinity;
    let bestRect: DOMRect | null = null;
    const locked = s.anchor && ((s.anchor.mode === 'logo' && rig.mode === 'logo' && calangoBus.reveal < 1) || (s.anchor.mode === 'home' && rig.mode === 'logo' && calangoBus.vanish > 0));
    for (const a of anchors.current) {
      if (!a.el.isConnected) continue;
      const r = a.el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      if (locked && a.el !== s.anchor!.el) continue;
      const cy = r.top + r.height / 2;
      const score = Math.abs(cy - vh * 0.5) - (a.el === s.anchor?.el ? vh * 0.14 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = a;
        bestRect = r;
      }
    }
    if (!best || !bestRect) {
      lizard.visible = false;
      return;
    }
    const a = best;
    const rect = bestRect;
    const center = new THREE.Vector2(rect.left + rect.width / 2, rect.top + rect.height / 2);

    // conversões tela ↔ chão (a vista inclina em torno do eixo x da tela)
    const toFloor = (sx: number, sy: number, tilt = s.tilt) => new THREE.Vector2(sx - vw / 2, (vh / 2 - sy) / Math.cos(tilt));

    // ── inclinação e escala alvo
    const targetTilt = reducedMotion ? 0 : a.tilt * DEG;
    let logo: { pose: LogoPose; svl: number } | null = null;
    if (a.mode === 'logo' || a.mode === 'home') {
      // escala e pose do desenho dentro do retângulo da âncora
      const toScreen = (x: number, y: number) => [rect.left + (x / CALANGO_VIEWBOX.width) * rect.width, rect.top + (y / CALANGO_VIEWBOX.height) * rect.height] as const;
      const pts = [LOGO_SNOUT, ...CALANGO_SPINE].map(([x, y]) => toScreen(x, y));
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const svl = len / 2.5;
      const feet: Partial<Record<LimbKey, THREE.Vector2>> = {};
      (Object.keys(LOGO_FEET) as LimbKey[]).forEach((k) => {
        const [sx, sy] = toScreen(...LOGO_FEET[k]);
        feet[k] = toFloor(sx, sy, 0);
      });
      logo = { pose: { spine: pts.map(([x, y]) => toFloor(x, y, 0)), feet }, svl };
    }
    const targetSvl = logo ? logo.svl : THREE.MathUtils.clamp((a.size as number) * vh, 56, 380);

    // ── primeira aparição: já na pose do desenho do hero (invisível até a transformação)
    if (!s.placed) {
      s.placed = true;
      s.anchor = a;
      s.anchorPos.copy(center);
      s.tilt = targetTilt;
      s.svl = targetSvl;
      const p = toFloor(center.x, center.y);
      rig.place(p.x, p.y, Math.PI / 2, s.svl);
      if (logo) {
        rig.svl = logo.svl;
        rig.setLogoPose(logo.pose);
        s.posedAt = a.id;
      }
    }

    // ── troca de âncora / carregar junto com a página
    if (s.anchor?.el !== a.el) {
      const leaving = s.anchor;
      s.anchor = a;
      s.anchorPos.copy(center);
      s.wanderAt = 0;
      s.wander.set(0, 0);
      if (leaving && rig.mode === 'logo') {
        // acorda: sai da pose do desenho, pisca e faz flexões
        rig.setLogoPose(null);
        s.posedAt = '';
        if (!reducedMotion) rig.display();
      }
      // se o calango ficou muito longe (salto pelo índice), ele entra correndo pela borda
      const tgt = toFloor(center.x, center.y);
      if (rig.pos.distanceTo(tgt) > vh * 1.7) {
        const dir = new THREE.Vector2().subVectors(tgt, rig.pos).normalize();
        const entry = tgt.clone().addScaledVector(dir, -vh * 0.75);
        rig.place(entry.x, entry.y, Math.atan2(dir.y, dir.x), s.svl);
      }
    } else {
      s.anchor = a;
      const dx = center.x - s.anchorPos.x;
      const dy = center.y - s.anchorPos.y;
      if ((dx || dy) && a.carry) {
        rig.carry(dx, -dy / Math.cos(s.tilt));
        s.carry.x += dx;
        s.carry.y += -dy / Math.cos(s.tilt);
        s.anchorPos.copy(center);
      }
    }

    // ── transições suaves de inclinação e tamanho
    const kT = 1 - Math.exp(-dt * 2.2);
    const newTilt = s.tilt + (targetTilt - s.tilt) * kT;
    if (Math.abs(newTilt - s.tilt) > 1e-5) {
      rig.stretchY(Math.cos(s.tilt) / Math.cos(newTilt));
      s.tilt = newTilt;
    }
    if (rig.mode !== 'logo') {
      const newSvl = s.svl + (targetSvl - s.svl) * (1 - Math.exp(-dt * 1.6));
      rig.rescale(newSvl);
      s.svl = newSvl;
    } else s.svl = rig.svl;

    // ── modos
    const target = toFloor(center.x, center.y);
    if (a.mode === 'logo' || a.mode === 'home') {
      // chega perto e então assume a pose do desenho
      if (rig.mode !== 'logo') {
        rig.target.copy(target);
        rig.idleHeading = null;
        if (logo && rig.pos.distanceTo(target) < s.svl * 0.5 && Math.abs(s.svl - logo.svl) < logo.svl * 0.25 && s.tilt < 0.08) {
          rig.svl = logo.svl;
          rig.setLogoPose(logo.pose, 0.7);
          s.posedAt = a.id;
        }
      }
    } else {
      // passeio: vai até a âncora; parado, às vezes escolhe outro ponto por perto
      const now = state.clock.elapsedTime;
      if (rig.resting && now > s.wanderAt) {
        s.wanderAt = now + 3.5 + Math.random() * 5;
        const ang = Math.random() * Math.PI * 2;
        const rad = a.wander * s.svl * (0.4 + Math.random() * 0.6);
        s.wander.set(Math.cos(ang) * rad, Math.sin(ang) * rad);
      }
      const wx = THREE.MathUtils.clamp(target.x + s.wander.x, -vw / 2 + s.svl * 0.5, vw / 2 - s.svl * 0.5);
      const wy = target.y + s.wander.y;
      if (!rig.fleeing) rig.target.set(wx, wy);
      rig.idleHeading = a.heading != null ? Math.atan2(Math.cos(a.heading * DEG) / Math.cos(s.tilt), Math.sin(a.heading * DEG)) : null;
    }

    // ── cursor: olhar, susto e toque
    const recent = performance.now() / 1000 - s.pointerT < 4;
    const pf = toFloor(s.pointer.x, s.pointer.y);
    rig.look = recent && s.pointer.x > -1e4 ? pf : null;
    // hit-test com o corpo projetado na tela
    const headP = rig.bonePosition('head', lizard, new THREE.Vector3());
    const pelvisP = rig.bonePosition('pelvis', lizard, new THREE.Vector3());
    const scr = (p: THREE.Vector3) => new THREE.Vector2(p.x + vw / 2, vh / 2 - p.y * Math.cos(s.tilt));
    const hs = scr(headP);
    const ps = scr(pelvisP);
    const seg = new THREE.Vector2().subVectors(ps, hs);
    const tt = THREE.MathUtils.clamp(new THREE.Vector2().subVectors(s.pointer, hs).dot(seg) / Math.max(1, seg.lengthSq()), 0, 1);
    const near = hs.clone().addScaledVector(seg, tt).distanceTo(s.pointer);
    const visible = s.reveal > 0.6;
    const hover = visible && near < s.svl * 0.2;
    if (hover !== s.hover) {
      s.hover = hover;
      experience.set({ cursor: hover ? 'Calango' : null });
    }
    if (visible && rig.mode === 'live' && !reducedMotion && s.pointerVel > 1500 && hs.distanceTo(s.pointer) < s.svl * 1.1) {
      // passou rápido demais perto da cabeça: ele dispara para longe
      rig.startle(pf, s.svl * 2.2);
      s.pointerVel = 0;
    }

    // ── as seções podem pedir uma exibição (ex.: a cada frase do manifesto)
    if (calangoBus.cue !== s.cue) {
      s.cue = calangoBus.cue;
      if (rig.mode === 'live' && !reducedMotion && s.reveal > 0.6 && !rig.fleeing) rig.display();
    }

    // ── simulação
    rig.update(dt, { reduced: reducedMotion, rootObject: lizard });

    // ── transformação (hero) e volta para casa (patch)
    const U = build.mats.uniforms;
    let reveal = 1;
    if (rig.mode === 'logo' && s.posedAt === 'hero' && a.mode === 'logo') {
      const r = calangoBus.reveal;
      reveal = THREE.MathUtils.clamp((r - 0.24) / 0.62, 0, 1);
      U.uDissolveDir.value = 1;
      // os caracteres são capturados no instante em que a transformação começa (o desenho já está no lugar)
      if (r <= 0.001 && s.particlesFor === 'hero') dropParticles();
      if (r > 0.001) ensureParticles('hero');
      driveParticles(r, r > 0 && r < 1 ? Math.min(1, r / 0.04) : 0);
    } else if (rig.mode === 'logo' && a.mode === 'home' && s.posedAt === a.id) {
      const v = calangoBus.vanish;
      reveal = 1 - THREE.MathUtils.clamp((v - 0.05) / 0.62, 0, 1);
      U.uDissolveDir.value = 1;
      if (v <= 0.001 && s.particlesFor === 'home') dropParticles();
      if (v > 0.001) ensureParticles('home');
      driveParticles(v, v > 0 && v < 1 ? 1 : 0);
      calangoBus.landed = v;
    } else {
      calangoBus.landed = 0;
      if (rig.mode === 'live' && !s.awake) {
        s.awake = true;
        if (!reducedMotion) rig.display();
      }
      driveParticles(0, 0);
    }
    if (rig.mode === 'logo' && s.posedAt === 'hero' && a.mode !== 'logo') reveal = 1;
    s.reveal = reveal;
    U.uReveal.value = reveal;
    U.uBumpPx.value = s.svl * 0.0019;
    U.uScales.value = high ? 1 : 0;
    lizard.visible = reveal > 0.001;

    // ── transformações do grupo
    floor.rotation.x = -s.tilt;
    lizard.scale.setScalar(rig.svl);

    // sombra de contato no chão, sob o corpo
    const sh = shadowRef.current;
    if (sh) {
      sh.visible = lizard.visible;
      const c = headP.clone().add(pelvisP).multiplyScalar(0.5);
      sh.position.set(c.x, c.y, 0.5);
      sh.scale.setScalar(rig.svl * 3.4);
    }

    // camada: na frente do conteúdo quando a âncora pede
    const front = a.front;
    if (front !== s.front && wrapperRef.current) {
      s.front = front;
      wrapperRef.current.classList.toggle('is-front', front);
    }

    function dropParticles() {
      const group = particlesRef.current;
      if (s.particles && group) {
        group.remove(s.particles);
        s.particles.geometry.dispose();
        (s.particles.material as THREE.Material).dispose();
      }
      s.particles = null;
      s.particlesFor = '';
    }

    function ensureParticles(kind: 'hero' | 'home') {
      if (s.particlesFor === kind && s.particles) return;
      const group = particlesRef.current;
      if (!group) return;
      if (s.particles) {
        group.remove(s.particles);
        s.particles.geometry.dispose();
        (s.particles.material as THREE.Material).dispose();
        s.particles = null;
      }
      // pontos da pele do calango, na pose atual, ordenados da cabeça à cauda
      lizard!.updateMatrixWorld(true);
      const mesh = build.mesh;
      const restPos = asset.geometry.getAttribute('position');
      const total = restPos.count;
      let glyphs: { x: number; y: number; ch: string; spine: number }[] = [];
      let cell = 8;
      if (kind === 'hero') {
        const asc = handoff.heroAscii;
        const cv = handoff.heroCanvas;
        if (!asc || !cv) return;
        const r = cv.getBoundingClientRect();
        glyphs = asc.glyphs(r).filter((g) => !g.gap);
        cell = asc.cellHeight(r);
      } else {
        const tmp = new AsciiCalango(document.createElement('canvas'), 46);
        glyphs = tmp.glyphs(rect).filter((g) => !g.gap);
        cell = tmp.cellHeight(rect);
      }
      const n = glyphs.length;
      if (!n) return;
      glyphs.sort((p, q) => p.spine - q.spine);
      const picks: { v: number; order: number }[] = [];
      for (let i = 0; i < n; i++) {
        const v = Math.floor(Math.random() * total);
        picks.push({ v, order: (1 - restPos.getY(v)) / 2.5 });
      }
      picks.sort((p, q) => p.order - q.order);
      const start = new Float32Array(n * 3);
      const end = new Float32Array(n * 3);
      const info = new Float32Array(n * 4);
      const tmpV = new THREE.Vector3();
      const toLocal = new THREE.Matrix4().copy(floor!.matrixWorld).invert();
      for (let i = 0; i < n; i++) {
        const g = glyphs[i];
        const gf = toFloor(g.x, g.y);
        mesh.getVertexPosition(picks[i].v, tmpV);
        tmpV.applyMatrix4(mesh.matrixWorld).applyMatrix4(toLocal);
        const surface = [tmpV.x, tmpV.y, tmpV.z];
        const glyphPt = [gf.x, gf.y, 0];
        const [from, to] = kind === 'hero' ? [glyphPt, surface] : [surface, glyphPt];
        start.set(from, i * 3);
        end.set(to, i * 3);
        const order = i / n;
        const delay = kind === 'hero' ? 0.06 + order * 0.5 : 0.04 + (1 - order) * 0.48;
        info.set([delay, glyphIndex(g.ch), Math.random(), kind === 'hero' ? cell * 1.08 : Math.max(3, cell * 0.9)], i * 4);
      }
      const pts = createParticles({ start, end, info }, 0.3);
      group.add(pts);
      s.particles = pts;
      s.particlesFor = kind;
      s.carry.set(0, 0, 0);
    }

    function driveParticles(t: number, fade: number) {
      const p = s.particles;
      if (!p) return;
      const m = p.material as THREE.ShaderMaterial;
      m.uniforms.uT.value = t;
      m.uniforms.uFade.value = fade;
      m.uniforms.uTime.value = state.clock.elapsedTime;
      (m.uniforms.uCarry.value as THREE.Vector3).copy(s.carry);
      p.visible = fade > 0.001;
    }
  });

  return (
    <group ref={floorRef}>
      <group ref={lizardRef}>
        <primitive object={build.mesh} />
      </group>
      <group ref={particlesRef} />
      {high && (
        <group ref={shadowRef}>
          <ContactShadows rotation-x={Math.PI / 2} scale={1} far={0.16} blur={2.6} opacity={0.62} resolution={256} frames={Infinity} color="#000000" />
        </group>
      )}
    </group>
  );
}

function Calango({ wrapperRef, high }: { wrapperRef: RefObject<HTMLDivElement | null>; high: boolean }) {
  const [asset, setAsset] = useState<CalangoAsset | null>(null);
  useEffect(() => {
    let alive = true;
    loadCalango()
      .then((a) => alive && setAsset(a))
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, []);
  if (!asset) return null;
  return <CalangoActor asset={asset} wrapperRef={wrapperRef} high={high} />;
}

export default function Stage() {
  const wrapper = useRef<HTMLDivElement | null>(null);
  // qualidade adaptativa: começa no máximo que o aparelho sugere e rebaixa se o quadro cair
  const [high, setHigh] = useState(!lowPower);
  const [dpr, setDpr] = useState(lowPower ? 1.25 : Math.min(window.devicePixelRatio || 1, 1.75));
  return (
    <Canvas
      className="stage-canvas"
      orthographic
      // o wrapper do R3F recebe a classe; usamos o elemento para trocar a camada (frente/trás)
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.15;
        wrapper.current = (gl.domElement.parentElement?.parentElement as HTMLDivElement | null) ?? null;
      }}
      gl={{ alpha: true, antialias: !lowPower, powerPreference: 'high-performance' }}
      dpr={dpr}
      camera={{ zoom: 1, position: [0, 0, 4000], near: 1, far: 9000 }}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}
    >
      <PerformanceMonitor
        flipflops={2}
        onDecline={() => {
          if (params.has('alta')) return;
          setHigh(false);
          setDpr(1);
        }}
      />
      <Studio />
      <Calango wrapperRef={wrapper} high={high} />
    </Canvas>
  );
}
