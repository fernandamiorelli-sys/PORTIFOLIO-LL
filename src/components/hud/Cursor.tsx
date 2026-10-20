import { useEffect, useRef } from 'react';
import { gsap } from '../../lib/scroll';
import { experience, isTouch } from '../../lib/store';
import './cursor.css';

/** Cursor de mira: um ponto, um anel e um rótulo que muda conforme o que está embaixo ([data-cursor]). */
export function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (isTouch) return;
    document.documentElement.classList.add('has-cursor');
    const dot = dotRef.current!;
    const ring = ringRef.current!;
    const label = labelRef.current!;
    const pos = { x: innerWidth / 2, y: innerHeight / 2 };
    const ringPos = { ...pos };
    let current = '';

    let lastTarget: HTMLElement | null = null;
    const paint = () => {
      // o palco 3D pode pedir um rótulo (o calango sob o cursor) acima de qualquer elemento
      const override = experience.get().cursor;
      const target = lastTarget?.closest?.('[data-cursor], a, button') as HTMLElement | null;
      const text = override ?? target?.dataset.cursor ?? (target ? '' : null);
      const next = text === null ? '' : text || '·';
      if (next !== current) {
        current = next;
        label.textContent = next === '·' ? '' : next;
        ring.classList.toggle('is-active', next !== '');
        ring.classList.toggle('has-label', next !== '' && next !== '·');
      }
    };
    const onMove = (e: PointerEvent) => {
      pos.x = e.clientX;
      pos.y = e.clientY;
      dot.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      lastTarget = e.target as HTMLElement;
      paint();
    };
    const unsub = experience.subscribe(paint);
    const onDown = () => ring.classList.add('is-down');
    const onUp = () => ring.classList.remove('is-down');
    const onLeave = () => ring.classList.add('is-gone');
    const onEnter = () => ring.classList.remove('is-gone');
    const tick = () => {
      ringPos.x += (pos.x - ringPos.x) * 0.18;
      ringPos.y += (pos.y - ringPos.y) * 0.18;
      ring.style.transform = `translate(${ringPos.x}px, ${ringPos.y}px)`;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    document.addEventListener('pointerleave', onLeave);
    document.addEventListener('pointerenter', onEnter);
    gsap.ticker.add(tick);
    return () => {
      unsub();
      document.documentElement.classList.remove('has-cursor');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('pointerenter', onEnter);
      gsap.ticker.remove(tick);
    };
  }, []);

  if (isTouch) return null;
  return (
    <div className="cursor" aria-hidden="true">
      <div ref={ringRef} className="cursor__ring">
        <span ref={labelRef} className="cursor__label t-mono" />
      </div>
      <div ref={dotRef} className="cursor__dot" />
    </div>
  );
}
