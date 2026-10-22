// Gera as versões web das imagens do acervo.
// Coloque os originais em media-src/img (jpg/png) e rode `npm run media`.
// Saída: public/media/img/<slug>-<largura>.{avif,webp,jpg} + src/data/media-manifest.json
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SRC = 'media-src/img';
const OUT = 'public/media/img';
const MANIFEST = 'src/data/media-manifest.json';
const WIDTHS = [480, 960, 1600];
// a foto que ocupa a tela inteira no computador também sai numa versão maior (telas Retina)
const WIDE = { 'lucas-lopes-dono-3x2': [960, 1600, 2400], 'lucas-lopes-dono-3x2-pb': [960, 1600, 2400] };

// variações derivadas de um original (ex.: retrato em P&B para o hero)
const DERIVED = [
  {
    from: 'lucas-lopes-dono.jpg',
    to: 'lucas-lopes-dono-pb.jpg',
    make: (img) => img.grayscale().linear(1.18, -14).modulate({ brightness: 1.02 }),
  },
  {
    from: 'lucas-lopes-dono-3x2.png',
    to: 'lucas-lopes-dono-3x2-pb.jpg',
    make: (img) => img.grayscale().linear(1.18, -14).modulate({ brightness: 1.02 }),
  },
];

await fs.mkdir(OUT, { recursive: true });
for (const d of DERIVED) {
  const src = path.join(SRC, d.from);
  const dst = path.join(SRC, d.to);
  try {
    await fs.access(dst);
  } catch {
    await d.make(sharp(src)).jpeg({ quality: 92 }).toFile(dst);
    console.log(`derivado: ${d.to}`);
  }
}

const files = (await fs.readdir(SRC)).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
let manifest = {};
try {
  manifest = JSON.parse(await fs.readFile(MANIFEST, 'utf8'));
} catch {
  /* primeiro uso */
}

for (const file of files) {
  const slug = file.replace(/\.(jpe?g|png)$/i, '');
  // pula o que já foi gerado e não mudou
  const srcStat = await fs.stat(path.join(SRC, file));
  const probe = manifest[slug] && path.join(OUT, `${slug}-${manifest[slug].widths.at(-1)}.avif`);
  if (probe) {
    try {
      if ((await fs.stat(probe)).mtimeMs >= srcStat.mtimeMs) continue;
    } catch {
      /* gera de novo */
    }
  }
  const input = sharp(path.join(SRC, file)).rotate();
  const { width, height } = await input.metadata();
  const sizes = WIDE[slug] ?? WIDTHS;
  const widths = [...new Set(sizes.filter((w) => w < width).concat(Math.min(width, sizes.at(-1))))];

  for (const w of widths) {
    const base = input.clone().resize({ width: w, withoutEnlargement: true });
    await base.clone().avif({ quality: 58, effort: 4 }).toFile(path.join(OUT, `${slug}-${w}.avif`));
    await base.clone().webp({ quality: 80, effort: 5 }).toFile(path.join(OUT, `${slug}-${w}.webp`));
    await base.clone().jpeg({ quality: 82, mozjpeg: true, progressive: true }).toFile(path.join(OUT, `${slug}-${w}.jpg`));
  }

  // placeholder borrado minúsculo + cor dominante, para pintar antes da imagem chegar
  const tiny = await input.clone().resize({ width: 24 }).blur(1.2).webp({ quality: 40 }).toBuffer();
  const { dominant } = await input.clone().stats();
  manifest[slug] = {
    width,
    height,
    widths,
    lqip: `data:image/webp;base64,${tiny.toString('base64')}`,
    color: `#${[dominant.r, dominant.g, dominant.b].map((c) => c.toString(16).padStart(2, '0')).join('')}`,
  };
  console.log(`${slug.padEnd(28)} ${width}x${height} -> ${widths.join(', ')}`);
}

await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`manifest: ${Object.keys(manifest).length} imagens`);
