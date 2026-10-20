import { lazy, Suspense, useEffect, useRef } from 'react';
import { experience } from '../lib/store';

// Bancada de testes do calango (só em desenvolvimento): /?bancada&tilt=40&size=0.3&walk
// Uma âncora no centro; com "walk", ela gira em círculo para o calango andar sem parar.
const Stage = lazy(() => import('../components/three/Stage'));

export default function Bench() {
  const ref = useRef<HTMLDivElement>(null);
  const q = new URLSearchParams(location.search);
  const tilt = q.get('tilt') ?? '40';
  const size = q.get('size') ?? '0.3';
  const walk = q.has('walk');
  const heading = q.get('heading');
  const bg = q.get('bg') ?? '#070807';

  useEffect(() => {
    experience.set({ phase: 'site', loaded: 1 });
    if (!walk) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      const t = (now - t0) / 1000;
      const r = Math.min(innerWidth, innerHeight) * 0.3;
      const el = ref.current;
      if (el) el.style.transform = `translate(${Math.cos(t * 0.35) * r}px, ${Math.sin(t * 0.35) * r * 0.8}px)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [walk]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: bg }}>
      <div
        ref={ref}
        data-calango="bench"
        data-calango-mode={walk ? 'roam' : 'stage'}
        data-calango-size={size}
        data-calango-tilt={tilt}
        data-calango-wander={walk ? '0' : '0'}
        {...(heading != null ? { 'data-calango-heading': heading } : {})}
        data-calango-carry={walk ? 'false' : 'true'}
        style={{ position: 'absolute', left: '50%', top: '50%', width: 2, height: 2 }}
      />
      <Suspense fallback={null}>
        <Stage />
      </Suspense>
    </div>
  );
}
