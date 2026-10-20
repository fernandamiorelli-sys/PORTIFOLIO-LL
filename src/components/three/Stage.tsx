import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { calangoBus } from '../../lib/calangoBus';
import { isTouch, reducedMotion } from '../../lib/store';
import { buildCalango } from './calangoGeometry';

// Palco 3D fixo atrás do conteúdo. O calango segue âncoras do DOM (data-calango="..."),
// anda pela página conforme o scroll e muda de camada quando precisa passar na frente.

const lowPower = isTouch || (navigator.hardwareConcurrency ?? 8) <= 4;

interface Anchor {
  el: HTMLElement;
  rot: number;
  tilt: number;
  spin: number;
  front: boolean;
  fit: number;
}

function readAnchors(): Anchor[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-calango]')).map((el) => ({
    el,
    rot: THREE.MathUtils.degToRad(Number(el.dataset.calangoRot ?? 0)),
    tilt: Number(el.dataset.calangoTilt ?? 0.25),
    spin: Number(el.dataset.calangoSpin ?? 0),
    front: el.dataset.calangoLayer === 'front',
    fit: Number(el.dataset.calangoFit ?? 1),
  }));
}

const tmpPlane = new THREE.Plane();
const tmpMat = new THREE.Matrix3();

function Calango({ wrapperRef }: { wrapperRef: RefObject<HTMLDivElement | null> }) {
  const { camera, size } = useThree();
  const build = useMemo(() => buildCalango(lowPower ? 'low' : 'high'), []);
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.SkinnedMesh>(null);
  const scanRef = useRef<THREE.Mesh>(null);
  const anchors = useRef<Anchor[]>([]);
  const state = useRef({ x: 0, y: 0, s: 0.3, rot: 0, tilt: 0.2, spin: 0, front: false, ready: false, phase: 0, look: new THREE.Vector2() });
  const pointer = useRef(new THREE.Vector2());
  const clip = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  const materials = useMemo(() => {
    const chrome = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#f4f7f5'),
      metalness: 1,
      roughness: 0.07,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      iridescence: 0.55,
      iridescenceIOR: 1.8,
      iridescenceThicknessRange: [200, 620],
      envMapIntensity: 2.4,
      clippingPlanes: [clip],
    });
    const glass = lowPower
      ? new THREE.MeshPhysicalMaterial({
          color: new THREE.Color('#8fe356'),
          metalness: 0.9,
          roughness: 0.1,
          clearcoat: 1,
          clearcoatRoughness: 0.03,
          iridescence: 0.35,
          envMapIntensity: 2.2,
          clippingPlanes: [clip],
        })
      : new THREE.MeshPhysicalMaterial({
          color: new THREE.Color('#dcffc4'),
          metalness: 0,
          roughness: 0.03,
          transmission: 1,
          thickness: 0.09,
          ior: 1.48,
          attenuationColor: new THREE.Color('#4fd12c'),
          attenuationDistance: 0.28,
          emissive: new THREE.Color('#1c4d10'),
          emissiveIntensity: 0.35,
          clearcoat: 1,
          clearcoatRoughness: 0.02,
          specularIntensity: 1,
          iridescence: 0.3,
          iridescenceIOR: 1.45,
          envMapIntensity: 2.2,
          clippingPlanes: [clip],
        });
    return [chrome, glass];
  }, [clip]);

  const skeleton = useMemo(() => new THREE.Skeleton(build.bones), [build]);

  useEffect(() => {
    const mesh = meshRef.current!;
    mesh.add(build.bones[0]);
    mesh.bind(skeleton);
    anchors.current = readAnchors();
    const refresh = window.setInterval(() => (anchors.current = readAnchors()), 1500);
    const onMove = (e: PointerEvent) => pointer.current.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    window.addEventListener('pointermove', onMove);
    return () => {
      window.clearInterval(refresh);
      window.removeEventListener('pointermove', onMove);
    };
  }, [build, skeleton]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const group = groupRef.current;
    const mesh = meshRef.current;
    if (!group || !mesh) return;
    const vw = size.width;
    const vh = size.height;
    const cam = camera as THREE.PerspectiveCamera;
    const visH = 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.position.z;
    const visW = visH * (vw / vh);
    const st = state.current;

    // alvo: interpolação entre a âncora logo acima e a logo abaixo do centro da tela
    const center = vh * 0.5;
    let above: { a: Anchor; r: DOMRect } | null = null;
    let below: { a: Anchor; r: DOMRect } | null = null;
    for (const a of anchors.current) {
      if (!a.el.isConnected) continue;
      const r = a.el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const cy = r.top + r.height / 2;
      if (cy <= center) above = { a, r };
      else if (!below) below = { a, r };
    }
    if (!above && !below) {
      group.visible = false;
      return;
    }
    // uma âncora fixa na tela (seção pinada) prende o calango; âncoras longe só valem na travessia
    const near = (x: { r: DOMRect } | null, lo: number, hi: number) => {
      if (!x) return false;
      const cy = x.r.top + x.r.height / 2;
      return cy >= lo && cy <= hi;
    };
    const aNear = near(above, -vh * 0.3, vh);
    const bNear = near(below, 0, vh * 1.3);
    if (above && below && aNear !== bNear) {
      if (aNear) below = null;
      else above = null;
    }
    let t = 0;
    if (above && below) {
      const ya = above.r.top + above.r.height / 2;
      const yb = below.r.top + below.r.height / 2;
      t = THREE.MathUtils.clamp((center - ya) / Math.max(1, yb - ya), 0, 1);
      t = t * t * (3 - 2 * t);
    }
    const A = above ?? below!;
    const B = below ?? above!;
    const mix = (a: number, b: number) => a + (b - a) * t;
    const rect = {
      x: mix(A.r.left + A.r.width / 2, B.r.left + B.r.width / 2),
      y: mix(A.r.top + A.r.height / 2, B.r.top + B.r.height / 2),
      w: mix(A.r.width * A.a.fit, B.r.width * B.a.fit),
      h: mix(A.r.height * A.a.fit, B.r.height * B.a.fit),
    };
    const targetX = (rect.x / vw - 0.5) * visW;
    const targetY = -(rect.y / vh - 0.5) * visH;
    const targetRot = mix(A.a.rot, B.a.rot);
    // caixa do desenho girado, para caber na âncora em qualquer rotação
    const c = Math.abs(Math.cos(targetRot));
    const s = Math.abs(Math.sin(targetRot));
    const bbW = c * build.size.width + s * build.size.height;
    const bbH = s * build.size.width + c * build.size.height;
    const targetS = Math.min(((rect.h / vh) * visH) / bbH, ((rect.w / vw) * visW) / bbW);
    const targetTilt = mix(A.a.tilt, B.a.tilt);
    const targetSpin = mix(A.a.spin, B.a.spin);
    const front = (t < 0.5 ? A : B).a.front;

    // durante a transformação ASCII → 3D, o calango precisa coincidir exatamente com o desenho em caracteres
    const exact = calangoBus.reveal < 1 || !st.ready;
    const k = exact ? 1 : 1 - Math.exp(-dt * 6);
    const prevX = st.x;
    const prevY = st.y;
    st.x += (targetX - st.x) * k;
    st.y += (targetY - st.y) * k;
    st.s += (targetS - st.s) * k;
    st.rot += (targetRot - st.rot) * k;
    st.tilt += (targetTilt - st.tilt) * (exact ? 1 : 1 - Math.exp(-dt * 3));
    st.spin += targetSpin * dt;
    st.ready = true;
    const wrapper = wrapperRef.current;
    if (st.front !== front && wrapper) {
      st.front = front;
      wrapper.classList.toggle('is-front', front);
    }

    const speed = Math.hypot(st.x - prevX, st.y - prevY) / Math.max(dt, 1e-3);
    const walk = Math.min(1, speed * 0.6 + Math.abs(calangoBus.velocity) * 0.02);
    st.phase += dt * (reducedMotion ? 0 : 2.2 + walk * 9);

    group.position.set(st.x, st.y, 0);
    group.scale.setScalar(Math.max(0.0001, st.s));
    // o reveal acontece de frente; depois o calango ganha volume e gira com o mouse
    const live = calangoBus.reveal;
    st.look.lerp(pointer.current, 1 - Math.exp(-dt * 4));
    group.rotation.set(
      (-st.look.y * 0.35 + Math.sin(st.phase * 0.21) * 0.08) * st.tilt * live,
      (st.look.x * 0.6 + Math.sin(st.spin) * 1.1 * Math.min(1, Math.abs(targetSpin) * 5)) * st.tilt * live,
      st.rot,
    );

    // ondulação lateral: onda que corre da cabeça à cauda
    const bones = build.bones;
    const amp = reducedMotion ? 0 : 0.05 + walk * 0.12;
    for (let i = 1; i < bones.length; i++) {
      const env = Math.min(1, i / (bones.length * 0.35));
      bones[i].rotation.z = Math.sin(st.phase - i * 0.62) * amp * env * (i > bones.length - 5 ? 1.5 : 1);
    }
    bones[1].rotation.z += st.look.x * -0.12 * live;

    // corte de revelação (de cima para baixo) e de "impressão" no patch
    const reveal = THREE.MathUtils.clamp(calangoBus.reveal, 0, 1);
    const gap = Math.hypot(targetX - st.x, targetY - st.y) / visH;
    const arrived = THREE.MathUtils.clamp(1 - (gap - 0.02) / 0.08, 0, 1);
    const vanish = THREE.MathUtils.clamp(calangoBus.vanish, 0, 1) * arrived;
    calangoBus.landed = vanish;
    group.visible = reveal > 0.001 && vanish < 0.999;
    if (!group.visible) return;
    group.updateMatrixWorld();
    // plano local: visível onde y > corte. Revelação desce o corte; o sumiço sobe o piso.
    const top = 0.52;
    const bottom = -0.52;
    let cut: number;
    let normalY: number;
    if (vanish > 0) {
      cut = THREE.MathUtils.lerp(bottom, top, vanish);
      normalY = -1;
    } else {
      cut = THREE.MathUtils.lerp(top, bottom, reveal);
      normalY = 1;
    }
    tmpPlane.set(new THREE.Vector3(0, normalY, 0), -cut * normalY);
    tmpMat.getNormalMatrix(group.matrixWorld);
    clip.copy(tmpPlane).applyMatrix4(group.matrixWorld, tmpMat);

    const scan = scanRef.current;
    if (scan) {
      const scanning = (reveal > 0 && reveal < 1) || (vanish > 0 && vanish < 1);
      scan.visible = scanning;
      scan.position.set(0, cut, 0.02);
      (scan.material as THREE.MeshBasicMaterial).opacity = scanning ? 0.85 : 0;
    }
  });

  return (
    <group ref={groupRef}>
      <skinnedMesh ref={meshRef} geometry={build.geometry} material={materials} frustumCulled={false} />
      <mesh ref={scanRef} visible={false} renderOrder={10}>
        <planeGeometry args={[build.size.width * 1.25, 0.006]} />
        <meshBasicMaterial color="#9dff5c" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Studio() {
  // estúdio de luz feito só de "lightformers": nenhum HDR externo para baixar
  return (
    <Environment resolution={lowPower ? 128 : 256} frames={1}>
      <mesh scale={40}>
        <sphereGeometry args={[1, 32, 16]} />
        <shaderMaterial
          side={THREE.BackSide}
          depthWrite={false}
          vertexShader={'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'}
          fragmentShader={
            'varying vec3 vP; void main(){ float h = vP.y * 0.5 + 0.5; vec3 top = vec3(0.62, 0.66, 0.64); vec3 mid = vec3(0.10, 0.12, 0.11); vec3 low = vec3(0.03, 0.05, 0.03); vec3 c = mix(low, mid, smoothstep(0.0, 0.5, h)); c = mix(c, top, smoothstep(0.55, 1.0, h)); gl_FragColor = vec4(c, 1.0); }'
          }
        />
      </mesh>
      <Lightformer form="rect" intensity={5} color="#ffffff" position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[14, 14, 1]} />
      <Lightformer form="rect" intensity={3.2} color="#ffffff" position={[0, 3, -8]} scale={[16, 4, 1]} />
      <Lightformer form="rect" intensity={2.4} color="#e8e3d7" position={[-8, 1, 1]} rotation-y={Math.PI / 2} scale={[10, 2.4, 1]} />
      <Lightformer form="rect" intensity={2.4} color="#e8e3d7" position={[8, 0, 1]} rotation-y={-Math.PI / 2} scale={[10, 1.4, 1]} />
      <Lightformer form="rect" intensity={2.6} color="#7cd93b" position={[0, -6, 2]} rotation-x={-Math.PI / 2} scale={[12, 3, 1]} />
      <Lightformer form="ring" intensity={3} color="#a8c4b0" position={[4, 3, 7]} scale={2.6} />
      {/* faixas na frente do objeto: refletem na face plana e correm pela superfície quando ele gira */}
      <Lightformer form="circle" intensity={1.3} color="#f2f5f0" position={[0.6, 0.4, 10]} rotation-y={Math.PI} scale={5} />
      <Lightformer form="rect" intensity={4} color="#ffffff" position={[0, 2.2, 9]} rotation-y={Math.PI} scale={[12, 0.7, 1]} />
      <Lightformer form="rect" intensity={3} color="#e8e3d7" position={[-3.5, 0, 9]} rotation-y={Math.PI} scale={[0.5, 10, 1]} />
      <Lightformer form="rect" intensity={2.2} color="#7cd93b" position={[3, -1.6, 9]} rotation-y={Math.PI} scale={[6, 0.35, 1]} />
      <Lightformer form="rect" intensity={1.8} color="#6a7c96" position={[-4, -2, 7]} scale={[6, 0.6, 1]} />
    </Environment>
  );
}

export default function Stage() {
  const wrapper = useRef<HTMLDivElement | null>(null);
  return (
    <Canvas
      className="stage-canvas"
      // o wrapper do R3F recebe a classe; usamos o elemento para trocar a camada (frente/trás)
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.22;
        wrapper.current = (gl.domElement.parentElement?.parentElement as HTMLDivElement | null) ?? null;
      }}
      gl={{ alpha: true, antialias: !lowPower, powerPreference: 'high-performance' }}
      dpr={lowPower ? [1, 1.25] : [1, 1.75]}
      camera={{ fov: 30, position: [0, 0, 10], near: 0.1, far: 50 }}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}
    >
      <Studio />
      <Calango wrapperRef={wrapper} />
    </Canvas>
  );
}
