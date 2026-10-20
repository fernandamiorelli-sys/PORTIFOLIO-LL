import { useEffect, useRef } from 'react';
import { reducedMotion } from '../../lib/store';

/** Grão de filme por cima de tudo: uma textura de ruído gerada uma vez e deslocada em saltos. */
export function Grain() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    if (ref.current) ref.current.style.backgroundImage = `url(${c.toDataURL('image/png')})`;
  }, []);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: '-160px',
        zIndex: 150,
        pointerEvents: 'none',
        opacity: 0.055,
        mixBlendMode: 'overlay',
        animation: reducedMotion ? undefined : 'grain 0.9s steps(6) infinite',
      }}
    />
  );
}
