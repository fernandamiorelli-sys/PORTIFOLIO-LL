# Recorta o escudo oficial (media-src/crest/logo-abigos-principal.jpg) do círculo verde ao redor.
# Uso: python3 scripts/cut-crest.py
#  -> public/media/img/escudo-oficial-{512,1024}.{webp,png}  (transparente, para a title screen)
#  -> media-src/img/escudo-oficial.jpg  (sobre preto, alinhado ao escudo novo, para o comparador de Gume)
#  Depois rode `npm run media`.
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import color, measure, morphology

SRC = 'media-src/crest/logo-abigos-principal.jpg'
OUT = 'media-src/crest/escudo-oficial.png'

rgb = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float64) / 255
lab = color.rgb2lab(rgb)
H, W = rgb.shape[:2]

# cor do círculo: mediana de amostras na faixa entre o escudo e a borda do círculo
samples = [(100, 560), (150, 300), (980, 560), (300, 950), (540, 60), (120, 760), (960, 380)]
ref = np.median([lab[y, x] for x, y in samples], axis=0)
de = np.sqrt(((lab - ref) ** 2).sum(-1))

green = de < 16
# o componente não-verde que contém o centro do escudo é o escudo (+ a cauda que sai por baixo)
lbl = measure.label(~green, connectivity=1)
seed = lbl[500, 540]
mask = lbl == seed
mask = ndi.binary_fill_holes(mask)
# limpa respingos do JPEG na borda
mask = morphology.binary_opening(mask, morphology.disk(1.5)) if hasattr(morphology, 'binary_opening') else morphology.opening(mask, morphology.disk(1.5))
mask = ndi.binary_fill_holes(mask)
lbl2 = measure.label(mask)
mask = lbl2 == np.argmax(np.bincount(lbl2.ravel())[1:]) + 1

# alfa suave: dentro = 1; na faixa de borda, proporcional à distância de cor ao verde do círculo
inner = morphology.binary_erosion(mask, morphology.disk(1))
outer = morphology.binary_dilation(mask, morphology.disk(2))
band = outer & ~inner
alpha = inner.astype(np.float64)
a = np.clip((de - 6) / (30 - 6), 0, 1)
alpha[band] = a[band]
alpha = np.where(outer, alpha, 0)
alpha = ndi.gaussian_filter(alpha, 0.6) * outer

# remove o "vazamento" de verde nos pixels semitransparentes
ref_rgb = np.median([rgb[y, x] for x, y in samples], axis=0)
al = np.clip(alpha, 1e-3, 1)[..., None]
un = np.clip((rgb - (1 - al) * ref_rgb) / al, 0, 1)
out_rgb = np.where((alpha > 0.02)[..., None] & band[..., None], un, rgb)

ys, xs = np.where(alpha > 0.02)
pad = 6
y0, y1 = max(0, ys.min() - pad), min(H, ys.max() + pad + 1)
x0, x1 = max(0, xs.min() - pad), min(W, xs.max() + pad + 1)
rgba = np.dstack([out_rgb, alpha])[y0:y1, x0:x1]
import os
os.makedirs(os.path.dirname(OUT), exist_ok=True)
Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA').save(OUT)
print('escudo', x1 - x0, 'x', y1 - y0, '->', OUT)

crest = Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA')
for h in (512, 1024):
    w = round(crest.width * h / crest.height)
    im = crest.resize((w, h), Image.LANCZOS)
    im.save(f'public/media/img/escudo-oficial-{h}.webp', quality=88, method=6)
    im.save(f'public/media/img/escudo-oficial-{h}.png', optimize=True)

# versão para o comparador: mesma escala e posição do escudo novo (1254 x 1254, fundo preto)
s = 1066 / 879  # mesma altura total do escudo novo
big = crest.resize((round(crest.width * s), round(crest.height * s)), Image.LANCZOS)
canvas = Image.new('RGBA', (1254, 1254), (0, 0, 0, 255))
canvas.alpha_composite(big, (186, 72))
canvas.convert('RGB').save('media-src/img/escudo-oficial.jpg', quality=95)
print('ok: escudo transparente + versão do comparador')
