#!/usr/bin/env python3
"""
Calango de vidro: o logo minimalista (src/assets/calango.ts) extrudado como uma peça grossa de vidro,
com as bordas arredondadas, no espírito das letras de vidro das referências.

A forma é um sólido implícito: a silhueta 2D vira um campo de distância; a peça tem profundidade
uniforme e um chanfro em quarto de círculo que entra pela borda. Nas partes finas (dedos, ponta da
cauda), os dois chanfros se encontram no meio e a seção vira uma quilha arredondada, sem comer a
silhueta. A malha sai por marching cubes, é simplificada e recebe normais exatas, calculadas da
própria definição da superfície (vidro não perdoa faceta).

Saída: public/media/3d/calango-vidro.bin
  'CLGV' · u32 tamanho do cabeçalho · cabeçalho JSON · posições f32×3 · normais i8×4 · índices u16/u32
     + public/media/3d/calango-vidro-campo.png (mapa de campo para as normais por pixel)
Coordenadas do modelo: altura do logo = 1, y para cima, origem no centro do viewBox, frente em +z.

Uso: python3 scripts/glass-calango.py   (precisa de numpy, scipy, scikit-image, numba, fast-simplification, Pillow)
"""
import json
import math
import os
import re
import struct
import sys
import time

import numpy as np
from numba import njit, prange
from scipy import ndimage as ndi
from scipy.spatial import cKDTree

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'media', '3d', 'calango-vidro.bin')

VB_W, VB_H = 408.0, 642.0
# medidas em unidades do viewBox
HALF_DEPTH = float(os.environ.get('HALF_DEPTH', '40'))  # metade da espessura (a peça tem 80)
# raio do chanfro: pequeno, como nas letras de vidro da referência (faces planas, onde o texto atrás
# aparece limpo, e quinas finas que acendem e abrem em arco-íris)
BEVEL = float(os.environ.get('BEVEL', '10'))
GRID = 0.5  # passo da grade 2D
VOXEL = float(os.environ.get('VOXEL', '1.0'))  # passo da grade 3D
TRIS = int(os.environ.get('TRIS', '84000'))
PAD = 6.0


def read_path():
    src = open(os.path.join(ROOT, 'src', 'assets', 'calango.ts'), encoding='utf-8').read()
    return re.search(r"CALANGO_SILHOUETTE\s*=\s*'([^']*)'", src).group(1)


def path_polyline(d, step=0.08):
    """M/C absolutos → polilinha fechada e densa (passo ~step unidades)."""
    toks = re.findall(r'[MC]|-?\d*\.?\d+(?:e-?\d+)?', d)
    pts = []
    i = 0
    cur = None
    while i < len(toks):
        t = toks[i]
        if t == 'M':
            cur = (float(toks[i + 1]), float(toks[i + 2]))
            pts.append(cur)
            i += 3
        elif t == 'C':
            i += 1
            while i < len(toks) and toks[i] not in ('M', 'C'):
                p1 = (float(toks[i]), float(toks[i + 1]))
                p2 = (float(toks[i + 2]), float(toks[i + 3]))
                p3 = (float(toks[i + 4]), float(toks[i + 5]))
                i += 6
                chord = math.dist(cur, p1) + math.dist(p1, p2) + math.dist(p2, p3)
                n = max(4, int(math.ceil(chord / step)))
                ts = np.linspace(0, 1, n + 1)[1:]
                a = np.array(cur)
                b = np.array(p1)
                c = np.array(p2)
                e = np.array(p3)
                for tt in ts:
                    u = 1 - tt
                    q = u ** 3 * a + 3 * u * u * tt * b + 3 * u * tt * tt * c + tt ** 3 * e
                    pts.append((q[0], q[1]))
                cur = p3
        else:
            raise ValueError(f'comando inesperado {t}')
    P = np.array(pts)
    if np.linalg.norm(P[0] - P[-1]) > 1e-6:
        # fecha o contorno com pontos densos
        n = max(2, int(math.ceil(np.linalg.norm(P[0] - P[-1]) / step)))
        tail = [P[-1] + (P[0] - P[-1]) * k / n for k in range(1, n)]
        P = np.vstack([P, np.array(tail)]) if tail else P
    return P


@njit(cache=True)
def inside_grid(P, xs, ys):
    """Par-ímpar por linha de varredura: para cada y da grade, cruza o contorno uma vez."""
    nx = xs.shape[0]
    ny = ys.shape[0]
    out = np.zeros((ny, nx), dtype=np.bool_)
    n = P.shape[0]
    cross = np.empty(n, dtype=np.float64)
    for j in range(ny):
        y = ys[j]
        k = 0
        for i in range(n):
            x0 = P[i, 0]
            y0 = P[i, 1]
            x1 = P[(i + 1) % n, 0]
            y1 = P[(i + 1) % n, 1]
            if (y0 <= y < y1) or (y1 <= y < y0):
                cross[k] = x0 + (y - y0) * (x1 - x0) / (y1 - y0)
                k += 1
        c = np.sort(cross[:k])
        for m in range(0, k - 1, 2):
            a = c[m]
            b = c[m + 1]
            for ix in range(nx):
                if a <= xs[ix] < b:
                    out[j, ix] = True
    return out


def field_2d(P):
    xs = np.arange(-PAD, VB_W + PAD + 1e-9, GRID)
    ys = np.arange(-PAD, VB_H + PAD + 1e-9, GRID)
    t0 = time.time()
    ins = inside_grid(P, xs, ys)
    tree = cKDTree(P)
    gx, gy = np.meshgrid(xs, ys)
    dist, _ = tree.query(np.stack([gx.ravel(), gy.ravel()], 1), workers=-1)
    dist = dist.reshape(gx.shape)
    d2 = np.where(ins, -dist, dist)
    # distância para dentro, suavizada: arredonda a quilha onde os chanfros se encontram
    din = np.maximum(-d2, 0.0)
    ds = ndi.gaussian_filter(din, sigma=2.4 / GRID)
    # perto da borda, a suavização não pode mudar o chanfro: mistura (C1) com a distância exata
    t = np.clip((din - 3.0) / 9.0, 0, 1)
    w = t * t * (3 - 2 * t)
    ds = din + (np.minimum(ds, din) - din) * w
    ds = np.maximum(ds, 0.0)
    print(f'campo 2D {gx.shape[1]}x{gx.shape[0]} em {time.time()-t0:.1f}s', file=sys.stderr)
    return xs, ys, d2, ds


def zprof(d):
    """Altura da face (metade da espessura) em função da distância para dentro da borda."""
    r = BEVEL
    dd = np.clip(d, 0, r)
    return HALF_DEPTH - r + np.sqrt(np.maximum(r * r - (r - dd) ** 2, 0))


def sample(field, xs, ys, x, y, order=3):
    fx = (x - xs[0]) / GRID
    fy = (y - ys[0]) / GRID
    return ndi.map_coordinates(field, [fy, fx], order=order, mode='nearest')


def volume(xs, ys, d2, ds):
    vx = np.arange(-PAD, VB_W + PAD + 1e-9, VOXEL)
    vy = np.arange(-PAD, VB_H + PAD + 1e-9, VOXEL)
    zmax = HALF_DEPTH + 3
    vz = np.arange(-zmax, zmax + 1e-9, VOXEL)
    gx, gy = np.meshgrid(vx, vy)
    D = sample(d2, xs, ys, gx.ravel(), gy.ravel(), order=1).reshape(gx.shape)
    S = sample(ds, xs, ys, gx.ravel(), gy.ravel(), order=1).reshape(gx.shape)
    Z = zprof(S)
    wall = HALF_DEPTH - BEVEL
    vol = np.empty((vz.shape[0], vy.shape[0], vx.shape[0]), dtype=np.float32)
    for k, z in enumerate(vz):
        az = abs(z)
        inside = np.maximum(D, az - Z)
        outside = np.sqrt(D * D + np.maximum(az - wall, 0) ** 2)
        vol[k] = np.where(D <= 0, inside, outside)
    return vx, vy, vz, vol


def implicit(V, xs, ys, d2, ds):
    """O mesmo campo do volume, avaliado em pontos soltos (bicúbico), para projetar os vértices na superfície."""
    x, y, z = V[:, 0], V[:, 1], V[:, 2]
    D = sample(d2, xs, ys, x, y)
    S = np.maximum(sample(ds, xs, ys, x, y), 0)
    az = np.abs(z)
    inside = np.maximum(D, az - zprof(S))
    outside = np.sqrt(D * D + np.maximum(az - (HALF_DEPTH - BEVEL), 0) ** 2)
    return np.where(D <= 0, inside, outside)


def project(V, xs, ys, d2, ds, iters=4):
    """Newton ao longo do gradiente: tira o serrilhado que o marching cubes deixa nas curvas."""
    e = 0.05
    for _ in range(iters):
        f = implicit(V, xs, ys, d2, ds)
        g = np.stack([
            implicit(V + [e, 0, 0], xs, ys, d2, ds) - implicit(V - [e, 0, 0], xs, ys, d2, ds),
            implicit(V + [0, e, 0], xs, ys, d2, ds) - implicit(V - [0, e, 0], xs, ys, d2, ds),
            implicit(V + [0, 0, e], xs, ys, d2, ds) - implicit(V - [0, 0, e], xs, ys, d2, ds),
        ], 1) / (2 * e)
        g2 = np.sum(g * g, 1) + 1e-9
        V = V - (f / g2)[:, None] * g
    return V, np.abs(implicit(V, xs, ys, d2, ds))


def normals_at(V, xs, ys, d2, ds, gd2, gds):
    """Normal exata, sem ruído.

    Perto da borda, a superfície é uma parede vertical seguida de um chanfro em quarto de círculo:
    ali o ângulo vem da altura z (bem condicionada), não da distância para dentro (que varia muito
    pouco quando o chanfro está quase vertical). Mais para dentro, onde o chanfro deita, vem da
    derivada do perfil. As duas leituras coincidem na superfície exata e são misturadas com suavidade.
    """
    x, y, z = V[:, 0], V[:, 1], V[:, 2]
    out = np.stack([sample(gd2[1], xs, ys, x, y), sample(gd2[0], xs, ys, x, y)], 1)
    out /= np.linalg.norm(out, axis=1, keepdims=True) + 1e-12
    sdx = sample(gds[1], xs, ys, x, y)
    sdy = sample(gds[0], xs, ys, x, y)
    s = np.maximum(sample(ds, xs, ys, x, y), 0)
    r = BEVEL
    wall = HALF_DEPTH - r
    sz = np.sign(z)
    sz[sz == 0] = 1
    # leitura pela altura (borda): φ = 0 na parede, π/2 na face
    sphi = np.clip((np.abs(z) - wall) / r, 0, 1)
    cphi = np.sqrt(1 - sphi * sphi)
    n_z = np.stack([out[:, 0] * cphi, out[:, 1] * cphi, sz * sphi], 1)
    # leitura pelo perfil (face e chanfro deitado): n ∝ (-z'·∇s, sign z)
    dd = np.clip(s, 0, r)
    root = np.sqrt(np.maximum(r * r - (r - dd) ** 2, 1e-9))
    dz = np.where(s < r, (r - dd) / root, 0.0)
    n_s = np.stack([-dz * sdx, -dz * sdy, sz], 1)
    n_s /= np.linalg.norm(n_s, axis=1, keepdims=True) + 1e-12
    # onde o perfil está íngreme (perto da borda), vale a leitura pela altura; onde deita, a do perfil
    t = np.clip((n_s[:, 2] - 0.26) / 0.24, 0, 1)
    t = t * t * (3 - 2 * t)
    n = n_z * (1 - t[:, None]) + n_s * t[:, None]
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
    return n


def fill_holes_mask(xs, ys):
    """Olho e listras do logo (os furos do preenchimento do patch), para gravar no vidro."""
    src = open(os.path.join(ROOT, 'src', 'assets', 'calango.ts'), encoding='utf-8').read()
    d = re.search(r"CALANGO_FILL\s*=\s*'([^']*)'", src).group(1)
    subs = ['M' + p for p in d.split('M')[1:]]
    holes = []
    gx, gy = np.meshgrid(xs, ys)
    q = np.stack([gx.ravel(), gy.ravel()], 1)
    for sp in subs[1:]:
        P = path_polyline(sp, step=0.05)
        m = inside_grid(P, xs, ys)
        # distância exata até o contorno do furo (sem o serrilhado de uma máscara de pixels)
        dist, _ = cKDTree(P).query(q, workers=-1)
        din = np.where(m, dist.reshape(gx.shape), 0.0)
        holes.append((m.sum(), din))
    # só os furos que contam (o olho e as duas listras); as farpas mínimas perto do focinho ficam de fora
    holes.sort(key=lambda h: -h[0])
    return [h[1] for h in holes[:3]]


def field_png(xs, ys, d2, ds):
    """Duas metades RGB: à esquerda, a direção para fora da borda; à direita, a inclinação da face
    (perfil do chanfro + sulcos). O shader monta a normal por pixel com elas, sem depender da malha."""
    from PIL import Image
    gd = [ndi.gaussian_filter(g, 1.0 / GRID) for g in np.gradient(d2, GRID)]
    out = np.stack([gd[1], gd[0]], -1)
    out /= np.linalg.norm(out, axis=-1, keepdims=True) + 1e-12
    gs = [ndi.gaussian_filter(g, 0.6 / GRID) for g in np.gradient(ds, GRID)]
    r = BEVEL
    s = np.maximum(ds, 0)
    dd = np.clip(s, 0, r)
    dz = np.where(s < r, (r - dd) / np.sqrt(np.maximum(r * r - (r - dd) ** 2, 1e-9)), 0.0)
    g = np.stack([-dz * gs[1], -dz * gs[0]], -1)
    # sulcos: perfil em U arredondado, com borda levemente suavizada
    groove = np.zeros_like(d2)
    for k, din_h in enumerate(fill_holes_mask(xs, ys)):
        m = din_h > 0
        half = din_h.max()
        rg = min(half, 1.7)
        depth = 2.4 if k == 0 else 1.7
        prof = depth * np.sqrt(np.clip(1 - (1 - np.clip(din_h / rg, 0, 1)) ** 2, 0, 1))
        groove = np.maximum(groove, np.where(m, prof, 0))
    groove = ndi.gaussian_filter(groove, 0.35 / GRID)
    gg = np.gradient(groove, GRID)
    g[..., 0] += gg[1]
    g[..., 1] += gg[0]
    # viewBox (y para baixo) → modelo (y para cima)
    out[..., 1] *= -1
    g[..., 1] *= -1
    # compressão radial: precisão máxima perto de zero (face), onde o vidro mais mostra
    mag = np.linalg.norm(g, axis=-1, keepdims=True)
    gc = g / (1 + mag)
    enc = lambda v: np.clip(np.round((v * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)
    H, W = d2.shape
    img = np.zeros((H, W * 2, 3), np.uint8)
    img[:, :W, 0] = enc(out[..., 0])
    img[:, :W, 1] = enc(out[..., 1])
    img[:, W:, 0] = enc(gc[..., 0])
    img[:, W:, 1] = enc(gc[..., 1])
    # azul: dentro da silhueta (ajuda a depurar)
    img[:, :W, 2] = np.where(d2 <= 0, 255, 0)
    img[:, W:, 2] = np.clip(groove / 2.4 * 255, 0, 255).astype(np.uint8)
    path = OUT.replace('.bin', '-campo.png')
    Image.fromarray(img).save(path, optimize=True)
    print(f'{path}: {os.path.getsize(path)/1024:.0f} KB ({W*2}x{H})', file=sys.stderr)
    return {'size': [W, H], 'min': [float(xs[0]), float(ys[-1])], 'max': [float(xs[-1]), float(ys[0])]}


def main():
    t0 = time.time()
    P = path_polyline(read_path())
    print(f'contorno: {len(P)} pontos', file=sys.stderr)
    xs, ys, d2, ds = field_2d(P)
    field = field_png(xs, ys, d2, ds)
    vx, vy, vz, vol = volume(xs, ys, d2, ds)
    print(f'volume {vol.shape} = {vol.size/1e6:.1f} M voxels', file=sys.stderr)

    from skimage import measure
    verts, faces, _, _ = measure.marching_cubes(vol, level=0.0, spacing=(VOXEL, VOXEL, VOXEL))
    # (z, y, x) → (x, y, z) em unidades do viewBox (a orientação dos triângulos é conferida adiante)
    verts = np.stack([verts[:, 2] + vx[0], verts[:, 1] + vy[0], verts[:, 0] + vz[0]], 1)
    print(f'marching cubes: {len(verts)} vértices, {len(faces)} triângulos', file=sys.stderr)

    import fast_simplification
    red = 1 - TRIS / len(faces)
    verts, faces = fast_simplification.simplify(verts.astype(np.float32), faces.astype(np.int64), target_reduction=red, agg=float(os.environ.get('AGG', '5')))
    verts = verts.astype(np.float64)
    # tira triângulos degenerados e vértices órfãos que a simplificação deixa
    a, b, c = verts[faces[:, 0]], verts[faces[:, 1]], verts[faces[:, 2]]
    area = np.linalg.norm(np.cross(b - a, c - a), axis=1) / 2
    faces = faces[area > 1e-4]
    used = np.unique(faces)
    remap = np.full(len(verts), -1, np.int64)
    remap[used] = np.arange(len(used))
    verts = verts[used]
    faces = remap[faces]
    print(f'simplificado: {len(verts)} vértices, {len(faces)} triângulos', file=sys.stderr)

    verts, err = project(verts, xs, ys, d2, ds)
    print(f'erro depois da projeção: p99 {np.percentile(err, 99):.3f}  máx {err.max():.3f} unidades', file=sys.stderr)
    # gradientes levemente suavizados: a direção da normal não herda o serrilhado da grade
    gd2 = [ndi.gaussian_filter(g, 1.0 / GRID) for g in np.gradient(d2, GRID)]
    gds = [ndi.gaussian_filter(g, 0.6 / GRID) for g in np.gradient(ds, GRID)]
    N = normals_at(verts, xs, ys, d2, ds, gd2, gds)

    # confere a orientação dos triângulos com as normais (devem concordar)
    a, b, c = verts[faces[:, 0]], verts[faces[:, 1]], verts[faces[:, 2]]
    fn = np.cross(b - a, c - a)
    agree = np.sum(fn * (N[faces[:, 0]] + N[faces[:, 1]] + N[faces[:, 2]]), 1)
    if np.mean(agree < 0) > 0.5:
        faces = faces[:, ::-1]
        agree = -agree
    print(f'triângulos contra a normal: {np.mean(agree < 0)*100:.2f}%', file=sys.stderr)

    # coordenadas do modelo: centro do viewBox na origem, altura 1, y para cima, frente em +z
    cx, cy, s = VB_W / 2, VB_H / 2, 1 / VB_H
    pos = np.stack([(verts[:, 0] - cx) * s, -(verts[:, 1] - cy) * s, verts[:, 2] * s], 1).astype(np.float32)
    nrm = np.stack([N[:, 0], -N[:, 1], N[:, 2]], 1)
    # a troca de sinal de y espelha: inverte a ordem dos triângulos para manter a frente para fora
    faces = faces[:, ::-1]
    nq = np.round(np.clip(nrm, -1, 1) * 127).astype(np.int8)
    nq4 = np.concatenate([nq, np.zeros((len(nq), 1), np.int8)], 1)
    idx_type = 'uint16' if len(pos) < 65536 else 'uint32'
    idx = faces.astype(np.uint16 if idx_type == 'uint16' else np.uint32).ravel()

    header = {
        'version': 1,
        'units': 'logo-height',
        'vertexCount': int(len(pos)),
        'indexCount': int(len(idx)),
        'indexType': idx_type,
        'viewBox': [VB_W, VB_H],
        'center': [cx, cy],
        'scale': s,
        'halfDepth': HALF_DEPTH * s,
        'bevel': BEVEL * s,
        'bbox': [pos.min(0).round(5).tolist(), pos.max(0).round(5).tolist()],
        # mapa de campo: canto inferior esquerdo e superior direito, em coordenadas do modelo
        'field': {
            'texels': field['size'],
            'min': [(field['min'][0] - cx) * s, -(field['min'][1] - cy) * s],
            'max': [(field['max'][0] - cx) * s, -(field['max'][1] - cy) * s],
            'wall': (HALF_DEPTH - BEVEL) * s,
        },
        'layout': ['position f32x3', 'normal i8x4 (norm)', 'index'],
    }
    hj = json.dumps(header, separators=(',', ':')).encode()
    hj += b' ' * ((4 - (len(hj) + 8) % 4) % 4)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'wb') as f:
        f.write(b'CLGV')
        f.write(struct.pack('<I', len(hj)))
        f.write(hj)
        f.write(pos.tobytes())
        f.write(nq4.tobytes())
        f.write(idx.tobytes())
    print(f'{OUT}: {os.path.getsize(OUT)/1024:.0f} KB em {time.time()-t0:.1f}s', file=sys.stderr)
    if os.environ.get('DEBUG_NPZ'):
        np.savez(os.environ['DEBUG_NPZ'], verts=pos, normals=nrm, faces=faces)


if __name__ == '__main__':
    main()
