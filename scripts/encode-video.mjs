// Gera as versões web de um filme: WebM (VP9 + Opus) e MP4 (H.264 + AAC, para o Safari).
// Uso: node scripts/encode-video.mjs media-src/video/alvi-verde.mp4 [segundo-do-pôster]
// Saída: public/media/video/<nome>.webm, <nome>.mp4 e <nome>-poster.jpg (requer ffmpeg instalado).
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const input = process.argv[2];
const posterAt = process.argv[3] ?? '1';
if (!input) {
  console.error('uso: node scripts/encode-video.mjs <arquivo>');
  process.exit(1);
}
const name = path.basename(input).replace(/\.[^.]+$/, '');
const out = (ext) => path.join('public/media/video', `${name}${ext}`);
// até 1080 px no lado menor, sem ampliar
const scale = "scale='if(gt(iw,ih),-2,min(1080,iw))':'if(gt(iw,ih),min(1080,ih),-2)'";
const run = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', input, ...args], { stdio: 'inherit' });

run(['-vf', scale, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-row-mt', '1', '-c:a', 'libopus', '-b:a', '128k', out('.webm')]);
run(['-vf', scale, '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out('.mp4')]);
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', posterAt, '-i', input, '-vf', scale, '-frames:v', '1', '-q:v', '4', out('-poster.jpg')], { stdio: 'inherit' });
console.log(`ok: ${out('.webm')}, ${out('.mp4')}, ${out('-poster.jpg')}`);
