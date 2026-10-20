import { useRef, useState } from 'react';
import { imageUrl, media } from '../../lib/media';
import { Picture } from './Picture';

/**
 * Lupa de inspeção: segue o ponteiro e mostra a imagem em 2,6×, usando a maior variante.
 * Feita para Epiderme e Rural, onde o argumento da peça está na imperfeição microscópica.
 */
export function Loupe({ slug, alt }: { slug: string; alt: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const info = media(slug);
  const zoom = 2.6;
  const hi = imageUrl(slug, 1600, 'webp');

  const move = (e: React.PointerEvent) => {
    const wrap = wrapRef.current;
    const lens = lensRef.current;
    if (!wrap || !lens || !info) return;
    const img = wrap.querySelector('img')!;
    const r = img.getBoundingClientRect();
    // a imagem usa object-fit: contain; calculamos a área efetivamente desenhada
    const ratio = info.width / info.height;
    let w = r.width;
    let h = r.width / ratio;
    if (h > r.height) {
      h = r.height;
      w = h * ratio;
    }
    const ox = r.left + (r.width - w) / 2;
    const oy = r.top + (r.height - h) / 2;
    const x = e.clientX - ox;
    const y = e.clientY - oy;
    const inside = x >= 0 && y >= 0 && x <= w && y <= h;
    setActive(inside);
    if (!inside) return;
    const size = lens.offsetWidth;
    const wr = wrap.getBoundingClientRect();
    lens.style.transform = `translate(${e.clientX - wr.left - size / 2}px, ${e.clientY - wr.top - size / 2}px)`;
    lens.style.backgroundSize = `${w * zoom}px ${h * zoom}px`;
    lens.style.backgroundPosition = `${-(x * zoom - size / 2)}px ${-(y * zoom - size / 2)}px`;
  };

  return (
    <div
      ref={wrapRef}
      className={`loupe ${active ? 'is-active' : ''}`}
      onPointerMove={move}
      onPointerDown={move}
      onPointerLeave={() => setActive(false)}
      data-cursor="Lupa"
    >
      <Picture slug={slug} alt={alt} sizes="(max-width: 900px) 100vw, 60vw" fit="contain" className="sheet__pic" />
      <div ref={lensRef} className="loupe__lens" style={{ backgroundImage: `url(${hi})` }} aria-hidden="true">
        <span className="t-mono">{zoom.toFixed(1).replace('.', ',')}×</span>
      </div>
      <p className="loupe__hint t-mono" aria-hidden="true">
        Passe a lupa sobre a imagem
      </p>
    </div>
  );
}
