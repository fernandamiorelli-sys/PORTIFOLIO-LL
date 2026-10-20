// Textura procedural do vidro da title screen.
// Canal R: riscos e marcas de polimento · Canal G: manchas/digitais · Canal B: poeira.
// No shader, os riscos só "acendem" perto da luz que segue o mouse, como num vidro de verdade.

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createScratchTexture(width: number, height: number, seed = 2026) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const r = rand(seed);
  const area = (width * height) / (1600 * 900);

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';

  // riscos lineares longos, com algumas direções dominantes (como um vidro limpo sempre do mesmo jeito)
  const dominant = [r() * Math.PI, r() * Math.PI, r() * Math.PI];
  const longCount = Math.round(105 * area);
  for (let i = 0; i < longCount; i++) {
    const a = dominant[i % 3] + (r() - 0.5) * 0.5;
    const len = (0.04 + r() ** 2 * 0.45) * Math.max(width, height);
    const x = r() * width;
    const y = r() * height;
    const bend = (r() - 0.5) * len * 0.12;
    const x2 = x + Math.cos(a) * len;
    const y2 = y + Math.sin(a) * len;
    const mx = (x + x2) / 2 + Math.cos(a + Math.PI / 2) * bend;
    const my = (y + y2) / 2 + Math.sin(a + Math.PI / 2) * bend;
    ctx.strokeStyle = `rgba(255,0,0,${0.08 + r() * 0.42})`;
    ctx.lineWidth = 0.4 + r() ** 3 * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(mx, my, x2, y2);
    ctx.stroke();
  }

  // micro-riscos curtos e densos
  const microCount = Math.round(1400 * area);
  for (let i = 0; i < microCount; i++) {
    const a = r() * Math.PI * 2;
    const len = 3 + r() * 26;
    const x = r() * width;
    const y = r() * height;
    ctx.strokeStyle = `rgba(255,0,0,${0.05 + r() * 0.3})`;
    ctx.lineWidth = 0.35 + r() * 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }

  // marcas circulares de polimento
  const swirls = Math.round(7 * area) + 2;
  for (let i = 0; i < swirls; i++) {
    const cx = r() * width;
    const cy = r() * height;
    const rings = 14 + Math.floor(r() * 26);
    for (let k = 0; k < rings; k++) {
      const radius = 40 + r() * 320;
      const start = r() * Math.PI * 2;
      ctx.strokeStyle = `rgba(255,0,0,${0.03 + r() * 0.12})`;
      ctx.lineWidth = 0.4 + r() * 0.6;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, start, start + 0.3 + r() * 1.4);
      ctx.stroke();
    }
  }

  // manchas e digitais (G)
  const smudges = Math.round(16 * area) + 4;
  for (let i = 0; i < smudges; i++) {
    const x = r() * width;
    const y = r() * height;
    const rad = 60 + r() * 360;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const a = 0.08 + r() * 0.3;
    g.addColorStop(0, `rgba(0,255,0,${a})`);
    g.addColorStop(0.6, `rgba(0,255,0,${a * 0.35})`);
    g.addColorStop(1, 'rgba(0,255,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rad, rad * (0.5 + r() * 0.5), r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // espirais de digital
  for (let i = 0; i < Math.round(4 * area) + 1; i++) {
    const cx = r() * width;
    const cy = r() * height;
    for (let k = 0; k < 22; k++) {
      ctx.strokeStyle = `rgba(0,255,0,${0.05 + r() * 0.08})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 6 + k * 3.2, 8 + k * 4, 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // poeira (B)
  const dust = Math.round(900 * area);
  for (let i = 0; i < dust; i++) {
    ctx.fillStyle = `rgba(0,0,255,${0.2 + r() * 0.8})`;
    const s = 0.4 + r() ** 4 * 2.6;
    ctx.beginPath();
    ctx.arc(r() * width, r() * height, s, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}
