# Esculpe o calango (Tropidurus hispidus) como campo de distância assinada (SDF), gera a malha por
# marching cubes, simplifica, calcula normais pelo gradiente do SDF e os pesos de pele de cada osso.
#
# Uso: python3 scripts/sculpt-calango.py  ->  public/media/3d/calango.bin
# Requer: numpy, scipy, scikit-image, numba, fast-simplification (pip install fast-simplification numba)
#
# Unidades: comprimento rostro-cloacal (CRC) = 1. Eixos: +Y para a frente (focinho), +X à direita do
# animal, +Z para cima (dorso). Chão em z = 0. A cloaca fica em y = 0, a ponta do focinho em y = 1.
import json
import math
import os
import struct
import sys
import time

import numpy as np
from numba import njit, prange

OUT = 'public/media/3d/calango.bin'

# ───────────────────────────── perfil do corpo (cabeça → ponta da cauda)
# y, meia-largura, z da barriga, z da maior largura, z do dorso, expoente da superelipse
PROFILE = np.array([
    # cabeça: triangular vista de cima, alta (≈ 12,5% do CRC), maior largura no canto da mandíbula
    [1.000, 0.012, 0.036, 0.048, 0.058, 2.3],
    [0.990, 0.026, 0.031, 0.049, 0.066, 2.4],
    [0.975, 0.036, 0.028, 0.051, 0.076, 2.5],
    [0.950, 0.047, 0.025, 0.055, 0.089, 2.6],
    [0.920, 0.058, 0.023, 0.059, 0.102, 2.7],
    [0.890, 0.068, 0.022, 0.062, 0.112, 2.8],
    [0.860, 0.079, 0.021, 0.064, 0.119, 2.8],
    [0.830, 0.088, 0.020, 0.066, 0.124, 2.7],
    [0.800, 0.096, 0.020, 0.067, 0.128, 2.6],
    [0.780, 0.099, 0.021, 0.068, 0.129, 2.5],
    [0.760, 0.093, 0.024, 0.069, 0.128, 2.4],
    [0.735, 0.081, 0.027, 0.070, 0.126, 2.3],
    # pescoço
    [0.700, 0.078, 0.029, 0.070, 0.125, 2.2],
    [0.670, 0.088, 0.027, 0.070, 0.129, 2.2],
    # tronco robusto e levemente achatado
    [0.630, 0.102, 0.024, 0.070, 0.135, 2.3],
    [0.560, 0.114, 0.021, 0.068, 0.141, 2.4],
    [0.450, 0.126, 0.019, 0.066, 0.144, 2.5],
    [0.340, 0.130, 0.019, 0.064, 0.143, 2.5],
    [0.230, 0.122, 0.020, 0.063, 0.138, 2.4],
    [0.140, 0.104, 0.022, 0.062, 0.129, 2.3],
    [0.070, 0.087, 0.024, 0.060, 0.117, 2.2],
    [0.000, 0.071, 0.025, 0.058, 0.103, 2.1],
    # cauda: grossa no primeiro terço, depois afina até um fio
    [-0.060, 0.063, 0.024, 0.056, 0.095, 2.05],
    [-0.150, 0.057, 0.022, 0.053, 0.088, 2.0],
    [-0.300, 0.049, 0.019, 0.048, 0.078, 2.0],
    [-0.500, 0.041, 0.016, 0.042, 0.067, 2.0],
    [-0.750, 0.031, 0.013, 0.034, 0.054, 2.0],
    [-1.000, 0.022, 0.011, 0.026, 0.041, 2.0],
    [-1.250, 0.013, 0.009, 0.018, 0.027, 2.0],
    [-1.450, 0.006, 0.0075, 0.011, 0.015, 2.0],
    [-1.500, 0.0035, 0.008, 0.010, 0.012, 2.0],
], dtype=np.float64)[::-1].copy()  # crescente em y

# tabela densa para o numba
TAB_Y0, TAB_Y1, TAB_N = -1.5, 1.0, 2501
_ys = np.linspace(TAB_Y0, TAB_Y1, TAB_N)
TAB = np.zeros((TAB_N, 5))
for j in range(5):
    # interpolação monotônica (PCHIP) para o perfil não "inchar" entre os pontos
    from scipy.interpolate import PchipInterpolator
    TAB[:, j] = PchipInterpolator(PROFILE[:, 0], PROFILE[:, j + 1])(_ys)


# ───────────────────────────── primitivas
# tipo: 1 esfera, 2 elipsoide (com rotação), 3 cone arredondado, 4 toro (com rotação)
# op: 0 união suave, 1 subtração suave, 2 sulco (subtração limitada à casca perto da superfície)
# classe: 0 corpo, 1 cabeça, 2 membro, 3 dedo, 4 olho (órbita)
PRIMS = []  # (tipo, params[20], op, k, osso, classe)


def rot_z(deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def rot_x(deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rot_y(deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def frame_from_axis(axis):
    """Matriz cujas colunas são uma base ortonormal com o eixo z = axis."""
    z = np.asarray(axis, float)
    z = z / np.linalg.norm(z)
    t = np.array([0, 0, 1.0]) if abs(z[2]) < 0.9 else np.array([1.0, 0, 0])
    x = np.cross(t, z)
    x /= np.linalg.norm(x)
    y = np.cross(z, x)
    return np.stack([x, y, z], axis=1)


def P(kind, params, op=0, k=0.01, bone=0, cls=0, depth=0.0):
    arr = np.zeros(24)
    arr[: len(params)] = params
    arr[23] = depth
    PRIMS.append((kind, arr, op, k, bone, cls))


def sphere(c, r, **kw):
    P(1, [*c, r], **kw)


def ellipsoid(c, r, R=np.eye(3), **kw):
    # R: rotação do elipsoide (colunas = eixos locais em coordenadas do mundo)
    P(2, [*c, *r, *R.T.ravel()], **kw)


def cone(a, b, r1, r2, **kw):
    P(3, [*a, *b, r1, r2], **kw)


def torus(c, axis, R0, r0, **kw):
    F = frame_from_axis(axis)
    P(4, [*c, R0, r0, *F.T.ravel()], **kw)


# ───────────────────────────── ossos
BONES = []  # nome, pai, posição (repouso)


def bone(name, parent, pos):
    BONES.append((name, parent, np.array(pos, float)))
    return len(BONES) - 1


B = {}
B['pelvis'] = bone('pelvis', -1, (0, 0.10, 0.060))
B['spine1'] = bone('spine1', B['pelvis'], (0, 0.28, 0.062))
B['spine2'] = bone('spine2', B['spine1'], (0, 0.46, 0.063))
B['chest'] = bone('chest', B['spine2'], (0, 0.63, 0.066))
B['neck'] = bone('neck', B['chest'], (0, 0.71, 0.066))
B['head'] = bone('head', B['neck'], (0, 0.765, 0.062))
TAIL_Y = [-0.05, -0.18, -0.33, -0.49, -0.65, -0.82, -0.99, -1.15, -1.31]
prev = B['pelvis']
for i, ty in enumerate(TAIL_Y):
    zc = float(np.interp(ty, _ys, TAB[:, 2]))
    prev = B[f'tail{i}'] = bone(f'tail{i}', prev, (0, ty, zc))

# cadeia axial: (osso, y do início do segmento). Cada osso cobre do seu y até o próximo.
# cada osso da cauda cobre da sua junta para trás, até a junta seguinte (tail8 vai até a ponta)
AXIAL = [(B[f'tail{i}'], TAIL_Y[i + 1] if i + 1 < len(TAIL_Y) else -1.5) for i in reversed(range(len(TAIL_Y)))]
AXIAL += [(B['pelvis'], TAIL_Y[0]), (B['spine1'], 0.28), (B['spine2'], 0.46), (B['chest'], 0.63), (B['neck'], 0.71), (B['head'], 0.765)]
AX_BONES = np.array([b for b, _ in AXIAL], dtype=np.int64)
AX_Y = np.array([y for _, y in AXIAL], dtype=np.float64)


# ───────────────────────────── cabeça
HEAD = B['head']
# ponta do focinho arredondada
sphere((0, 0.993, 0.047), 0.0125, k=0.012, bone=HEAD, cls=1)
# músculos da mandíbula (machos de Tropidurus têm a cabeça larga atrás dos olhos)
for sx in (-1, 1):
    ellipsoid((sx * 0.070, 0.800, 0.070), (0.028, 0.050, 0.040), k=0.026, bone=HEAD, cls=1)
# mandíbula / queixo
ellipsoid((0, 0.912, 0.030), (0.048, 0.082, 0.016), k=0.016, bone=HEAD, cls=1)
EYE = {}
for sx in (-1, 1):
    # supraocular (escudo acima do olho)
    ellipsoid((sx * 0.047, 0.880, 0.106), (0.022, 0.036, 0.010), R=rot_z(sx * -8), k=0.012, bone=HEAD, cls=1)
    # canto rostral: aresta do olho à narina
    cone((sx * 0.031, 0.966, 0.079), (sx * 0.053, 0.904, 0.104), 0.0035, 0.005, k=0.016, bone=HEAD, cls=1)
    # borda da pálpebra (anel em volta da órbita)
    eye_c = np.array((sx * 0.064, 0.884, 0.077))
    axis = np.array((sx * 0.9, 0.06, 0.42))
    axis = axis / np.linalg.norm(axis)
    EYE[sx] = (eye_c, axis)
    torus(eye_c + axis * 0.0035, axis, 0.0192, 0.0044, k=0.006, bone=HEAD, cls=1)
    # órbita (o olho entra como esfera de vidro separada)
    sphere(eye_c, 0.0215, op=1, k=0.004, bone=HEAD, cls=4)
    # narina: borda + furo
    sphere((sx * 0.0185, 0.982, 0.059), 0.0066, k=0.004, bone=HEAD, cls=1)
    sphere((sx * 0.0202, 0.9835, 0.0605), 0.0040, op=1, k=0.002, bone=HEAD, cls=1)
    # abertura do ouvido (oval, vertical, atrás do canto da boca)
    ellipsoid((sx * 0.095, 0.757, 0.071), (0.010, 0.009, 0.019), op=1, k=0.004, bone=HEAD, cls=1)
    # escamas auriculares: pequena borda na frente do ouvido
    ellipsoid((sx * 0.094, 0.770, 0.071), (0.006, 0.005, 0.019), k=0.004, bone=HEAD, cls=1)

# ───────────────────────────── tronco
CHEST, PELVIS = B['chest'], B['pelvis']


for sx in (-1, 1):
    # cinturas escapular e pélvica
    ellipsoid((sx * 0.086, 0.632, 0.070), (0.036, 0.042, 0.036), k=0.022, bone=CHEST, cls=0)
    ellipsoid((sx * 0.074, 0.110, 0.066), (0.042, 0.052, 0.040), k=0.024, bone=PELVIS, cls=0)

# ───────────────────────────── membros
LIMBS = {}


def finger(base, direction, length, r0, bone_id, curl=0.0, drop=0.004):
    d = np.array(direction, float)
    d /= np.linalg.norm(d)
    side = np.cross(d, (0, 0, 1))
    p0 = np.array(base, float)
    p1 = p0 + d * length * 0.45 + np.array((0, 0, 0.0025))
    p2 = p0 + d * length * 0.86 + side * curl * length + np.array((0, 0, 0.0005))
    cone(p0, p1, r0, r0 * 0.86, k=0.004, bone=bone_id, cls=3)
    cone(p1, p2, r0 * 0.86, r0 * 0.62, k=0.0035, bone=bone_id, cls=3)
    # unha: fina, curvada para baixo
    tip = p2 + d * length * 0.16 + np.array((0, 0, -drop))
    cone(p2, tip, r0 * 0.5, r0 * 0.12, k=0.0015, bone=bone_id, cls=3)


def limb_front(sx):
    s = 'R' if sx > 0 else 'L'
    S = np.array((sx * 0.086, 0.632, 0.070))
    E = np.array((sx * 0.198, 0.590, 0.090))
    W = np.array((sx * 0.226, 0.690, 0.022))
    ua = bone(f'upperarm.{s}', CHEST, S)
    fa = bone(f'forearm.{s}', ua, E)
    hd = bone(f'hand.{s}', fa, W)
    LIMBS[f'front.{s}'] = (ua, fa, hd)
    cone(S, E, 0.026, 0.018, k=0.022, bone=ua, cls=2)
    # bíceps / tríceps
    ellipsoid(S + (E - S) * 0.45 + np.array((0, 0, 0.004)), (0.038, 0.021, 0.020), R=rot_z(sx * 20), k=0.014, bone=ua, cls=2)
    cone(E, W + np.array((0, 0, 0.007)), 0.021, 0.014, k=0.012, bone=fa, cls=2)
    ellipsoid(E + (W - E) * 0.3, (0.022, 0.03, 0.022), R=rot_z(sx * -20), k=0.012, bone=fa, cls=2)
    # palma
    heading = sx * -32  # aponta para a frente e para fora
    palm = W + np.array((sx * 0.011, 0.021, -0.010))
    ellipsoid(palm, (0.019, 0.025, 0.008), R=rot_z(heading), k=0.01, bone=hd, cls=2)
    # cinco dedos em leque (I interno ... V externo); IV é o mais longo
    lengths = [0.032, 0.048, 0.060, 0.064, 0.040]
    angles = [-24, 2, 22, 42, 72]
    radii = [0.0058, 0.0064, 0.0066, 0.0064, 0.0058]
    for i in range(5):
        # direção no plano do chão: 0° = frente (+y); positivo vira para fora
        ang = math.radians(sx * angles[i])
        d = np.array((math.sin(ang), math.cos(ang), -0.08))
        base = palm + np.array((math.sin(ang) * 0.017, math.cos(ang) * 0.017, 0.0))
        finger(base, d, lengths[i], radii[i], hd, curl=sx * 0.04)


def limb_hind(sx):
    s = 'R' if sx > 0 else 'L'
    H = np.array((sx * 0.074, 0.106, 0.064))
    K = np.array((sx * 0.246, 0.150, 0.092))
    A = np.array((sx * 0.276, 0.000, 0.022))
    th = bone(f'thigh.{s}', PELVIS, H)
    sh = bone(f'shin.{s}', th, K)
    ft = bone(f'foot.{s}', sh, A)
    LIMBS[f'hind.{s}'] = (th, sh, ft)
    cone(H, K, 0.037, 0.022, k=0.024, bone=th, cls=2)
    # coxa musculosa
    ellipsoid(H + (K - H) * 0.42 + np.array((0, -0.004, 0.005)), (0.056, 0.031, 0.029), R=rot_z(sx * -14), k=0.016, bone=th, cls=2)
    cone(K, A + np.array((0, 0, 0.007)), 0.025, 0.015, k=0.012, bone=sh, cls=2)
    ellipsoid(K + (A - K) * 0.28, (0.026, 0.036, 0.025), R=rot_z(sx * 12), k=0.012, bone=sh, cls=2)
    # pé: aponta para fora e um pouco para trás
    heading = 112  # graus a partir de +y, para o lado de fora
    ang = math.radians(sx * heading)
    fd = np.array((math.sin(ang), math.cos(ang), 0.0))
    sole = A + fd * 0.024 + np.array((0, 0, -0.011))
    ellipsoid(sole, (0.018, 0.034, 0.008), R=rot_z(-math.degrees(math.atan2(fd[0], fd[1]))), k=0.01, bone=ft, cls=2)
    # dedos: I curto ... IV muito longo; V sai mais atrás e diverge para fora
    lengths = [0.038, 0.062, 0.086, 0.122, 0.054]
    offsets = [-48, -24, -2, 12, 64]
    radii = [0.0060, 0.0066, 0.0070, 0.0072, 0.0062]
    for i in range(5):
        a = math.radians(sx * (heading + offsets[i]))
        d = np.array((math.sin(a), math.cos(a), -0.06))
        back = 0.030 if i < 4 else 0.004
        base = sole + fd * (back - 0.012) + np.array((math.sin(a), math.cos(a), 0)) * 0.006
        finger(base, d, lengths[i], radii[i], ft, curl=sx * -0.05)


for sx in (1, -1):
    limb_front(sx)
    limb_hind(sx)

N_PRIMS = len(PRIMS)
PT = np.array([p[0] for p in PRIMS], dtype=np.int64)
PP = np.stack([p[1] for p in PRIMS]).astype(np.float64)
PO = np.array([p[2] for p in PRIMS], dtype=np.int64)
PK = np.array([p[3] for p in PRIMS], dtype=np.float64)
PB = np.array([p[4] for p in PRIMS], dtype=np.int64)
PC = np.array([p[5] for p in PRIMS], dtype=np.int64)


def bounds(i):
    t, p = PT[i], PP[i]
    if t == 1:
        return p[:3], p[3]
    if t == 2:
        return p[:3], max(p[3:6])
    if t == 3:
        a, b = p[:3], p[3:6]
        return (a + b) / 2, np.linalg.norm(b - a) / 2 + max(p[6], p[7])
    if t == 4:
        return p[:3], p[3] + p[4]
    return np.zeros(3), 10.0


BC = np.zeros((N_PRIMS, 3))
BR = np.zeros(N_PRIMS)
for i in range(N_PRIMS):
    c, r = bounds(i)
    BC[i] = c
    BR[i] = r


# ───────────────────────────── avaliação (numba)
@njit(cache=True, fastmath=True)
def smin(a, b, k):
    h = max(k - abs(a - b), 0.0) / k
    return min(a, b) - h * h * k * 0.25


@njit(cache=True, fastmath=True)
def smax(a, b, k):
    return -smin(-a, -b, k)


@njit(cache=True, fastmath=True)
def body_sdf(x, y, z, tab):
    yy = min(max(y, TAB_Y0), TAB_Y1)
    f = (yy - TAB_Y0) / (TAB_Y1 - TAB_Y0) * (TAB_N - 1)
    i0 = int(f)
    if i0 >= TAB_N - 1:
        i0 = TAB_N - 2
    t = f - i0
    w = tab[i0, 0] * (1 - t) + tab[i0 + 1, 0] * t
    zb = tab[i0, 1] * (1 - t) + tab[i0 + 1, 1] * t
    zm = tab[i0, 2] * (1 - t) + tab[i0 + 1, 2] * t
    zt = tab[i0, 3] * (1 - t) + tab[i0 + 1, 3] * t
    n = tab[i0, 4] * (1 - t) + tab[i0 + 1, 4] * t
    dz = z - zm
    # altura da metade de cima e da de baixo, misturadas suavemente perto da linha mais larga
    # (sem isso o cromo denuncia uma "costura" ao longo do flanco)
    ht = zt - zm
    hb = zm - zb
    s = min(max(dz / (0.5 * (ht + hb)) * 1.6 + 0.5, 0.0), 1.0)
    s = s * s * (3.0 - 2.0 * s)
    h = hb + (ht - hb) * s
    qx = abs(x) / w
    qz = abs(dz) / h
    q = (qx ** n + qz ** n) ** (1.0 / n) - 1.0
    d = q * min(w, h)
    dy = abs(y - yy)
    if dy > 0.0:
        if d > 0.0:
            d = math.sqrt(d * d + dy * dy)
        else:
            d = dy
    return d


@njit(cache=True, fastmath=True)
def prim_sdf(t, p, x, y, z):
    if t == 1:
        dx = x - p[0]
        dy = y - p[1]
        dz = z - p[2]
        return math.sqrt(dx * dx + dy * dy + dz * dz) - p[3]
    if t == 2:
        dx = x - p[0]
        dy = y - p[1]
        dz = z - p[2]
        # para o espaço local (R^T * d); params 6..14 = R^T por linhas
        lx = p[6] * dx + p[7] * dy + p[8] * dz
        ly = p[9] * dx + p[10] * dy + p[11] * dz
        lz = p[12] * dx + p[13] * dy + p[14] * dz
        k0 = math.sqrt((lx / p[3]) ** 2 + (ly / p[4]) ** 2 + (lz / p[5]) ** 2)
        k1 = math.sqrt((lx / (p[3] * p[3])) ** 2 + (ly / (p[4] * p[4])) ** 2 + (lz / (p[5] * p[5])) ** 2)
        if k1 < 1e-12:
            return -min(p[3], min(p[4], p[5]))
        return k0 * (k0 - 1.0) / k1
    if t == 3:
        ax, ay, az = p[0], p[1], p[2]
        bax = p[3] - ax
        bay = p[4] - ay
        baz = p[5] - az
        r1 = p[6]
        r2 = p[7]
        l2 = bax * bax + bay * bay + baz * baz
        rr = r1 - r2
        a2 = l2 - rr * rr
        il2 = 1.0 / l2
        pax = x - ax
        pay = y - ay
        paz = z - az
        yv = pax * bax + pay * bay + paz * baz
        zv = yv - l2
        cx = pax * l2 - bax * yv
        cy = pay * l2 - bay * yv
        cz = paz * l2 - baz * yv
        x2 = cx * cx + cy * cy + cz * cz
        y2 = yv * yv * l2
        z2 = zv * zv * l2
        sgn = 1.0 if rr >= 0 else -1.0
        k = sgn * rr * rr * x2
        sz = 1.0 if zv >= 0 else -1.0
        sy = 1.0 if yv >= 0 else -1.0
        if sz * a2 * z2 > k:
            return math.sqrt(x2 + z2) * il2 - r2
        if sy * a2 * y2 < k:
            return math.sqrt(x2 + y2) * il2 - r1
        return (math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - r1
    if t == 4:
        dx = x - p[0]
        dy = y - p[1]
        dz = z - p[2]
        lx = p[5] * dx + p[6] * dy + p[7] * dz
        ly = p[8] * dx + p[9] * dy + p[10] * dz
        lz = p[11] * dx + p[12] * dy + p[13] * dz
        q = math.sqrt(lx * lx + ly * ly) - p[3]
        return math.sqrt(q * q + lz * lz) - p[4]
    return 1e9


@njit(cache=True, fastmath=True)
def sdf_point(x, y, z, tab, PT, PP, PO, PK, BC, BR):
    d = body_sdf(x, y, z, tab)
    for i in range(PT.shape[0]):
        k = PK[i]
        dx = x - BC[i, 0]
        dy = y - BC[i, 1]
        dz = z - BC[i, 2]
        lb = math.sqrt(dx * dx + dy * dy + dz * dz) - BR[i]
        op = PO[i]
        if op == 0:
            if lb > d + k:
                continue
            d = smin(d, prim_sdf(PT[i], PP[i], x, y, z), k)
        else:
            if lb > k:
                continue
            d = smax(d, -prim_sdf(PT[i], PP[i], x, y, z), k)
    return d


@njit(parallel=True, cache=True, fastmath=True)
def eval_grid(x0, y0, z0, h, nx, ny, nz, tab, PT, PP, PO, PK, BC, BR):
    out = np.empty((nx, ny, nz), dtype=np.float32)
    for i in prange(nx):
        x = x0 + i * h
        for j in range(ny):
            y = y0 + j * h
            for k in range(nz):
                out[i, j, k] = sdf_point(x, y, z0 + k * h, tab, PT, PP, PO, PK, BC, BR)
    return out


@njit(parallel=True, cache=True, fastmath=True)
def eval_points(pts, tab, PT, PP, PO, PK, BC, BR):
    out = np.empty(pts.shape[0])
    for i in prange(pts.shape[0]):
        out[i] = sdf_point(pts[i, 0], pts[i, 1], pts[i, 2], tab, PT, PP, PO, PK, BC, BR)
    return out


@njit(parallel=True, cache=True, fastmath=True)
def prim_dists(pts, tab, PT, PP):
    # distância de cada vértice a cada primitiva (coluna 0 = corpo)
    out = np.empty((pts.shape[0], PT.shape[0] + 1))
    for i in prange(pts.shape[0]):
        x, y, z = pts[i, 0], pts[i, 1], pts[i, 2]
        out[i, 0] = body_sdf(x, y, z, tab)
        for j in range(PT.shape[0]):
            out[i, j + 1] = prim_sdf(PT[j], PP[j], x, y, z)
    return out


def main():
    h = float(os.environ.get('VOXEL', '0.0028'))
    lo = np.array([-0.50, -1.53, -0.012])
    hi = np.array([0.50, 1.03, 0.170])
    nx, ny, nz = ((hi - lo) / h).astype(int) + 1
    t0 = time.time()
    vol = eval_grid(lo[0], lo[1], lo[2], h, nx, ny, nz, TAB, PT, PP, PO, PK, BC, BR)
    print(f'grade {nx}x{ny}x{nz} = {nx*ny*nz/1e6:.1f} M voxels em {time.time()-t0:.1f}s', file=sys.stderr)

    from skimage import measure
    verts, faces, _, _ = measure.marching_cubes(vol, level=0.0, spacing=(h, h, h))
    verts += lo
    print(f'marching cubes: {len(verts)} vértices, {len(faces)} triângulos', file=sys.stderr)

    import fast_simplification
    target = int(os.environ.get('TRIS', '52000'))
    red = 1 - target / len(faces)
    verts, faces = fast_simplification.simplify(verts.astype(np.float32), faces.astype(np.int64), target_reduction=red, agg=5)
    verts = verts.astype(np.float64)
    print(f'simplificado: {len(verts)} vértices, {len(faces)} triângulos', file=sys.stderr)

    # projeta de volta na superfície exata e tira as normais do gradiente do SDF
    e = 1e-4
    for _ in range(2):
        d = eval_points(verts, TAB, PT, PP, PO, PK, BC, BR)
        g = np.stack([
            eval_points(verts + [e, 0, 0], TAB, PT, PP, PO, PK, BC, BR) - eval_points(verts - [e, 0, 0], TAB, PT, PP, PO, PK, BC, BR),
            eval_points(verts + [0, e, 0], TAB, PT, PP, PO, PK, BC, BR) - eval_points(verts - [0, e, 0], TAB, PT, PP, PO, PK, BC, BR),
            eval_points(verts + [0, 0, e], TAB, PT, PP, PO, PK, BC, BR) - eval_points(verts - [0, 0, e], TAB, PT, PP, PO, PK, BC, BR),
        ], 1) / (2 * e)
        gn = np.linalg.norm(g, axis=1, keepdims=True) + 1e-12
        normals = g / gn
        verts -= normals * (d / gn[:, 0])[:, None] * 0.9

    # ── pesos de pele
    nb = len(BONES)
    pd = prim_dists(verts, TAB, PT, PP)  # [v, 1 + prims]
    # quem contém o vértice influencia por inteiro; quem está perto da pele, menos
    sigma = 0.006
    infl = np.exp(-np.maximum(0, pd) / sigma)
    W = np.zeros((len(verts), nb))
    # corpo: distribui entre os ossos axiais pela posição em y, com mistura suave nas juntas
    yv = verts[:, 1]
    ax = np.zeros((len(verts), nb))
    for s in range(len(AX_Y)):
        y_start = AX_Y[s]
        y_end = AX_Y[s + 1] if s + 1 < len(AX_Y) else 1.05
        seg = y_end - y_start
        b = AX_BONES[s]
        blend_in = 0.0 if s == 0 else 0.35 * min(seg, AX_Y[s] - AX_Y[s - 1])
        blend_out = 0.0 if s + 1 >= len(AX_Y) else 0.35 * min(seg, (AX_Y[s + 2] if s + 2 < len(AX_Y) else 1.05) - AX_Y[s + 1])
        def ss(a, b2, x):
            t = np.clip((x - a) / max(b2 - a, 1e-9), 0, 1)
            return t * t * (3 - 2 * t)
        win = ss(y_start - blend_in, y_start + blend_in, yv) if blend_in > 0 else (yv >= y_start).astype(float)
        wout = 1 - (ss(y_end - blend_out, y_end + blend_out, yv) if blend_out > 0 else (yv >= y_end).astype(float))
        ax[:, b] += np.clip(win * wout, 0, 1)
    ax /= ax.sum(axis=1, keepdims=True) + 1e-9
    W += infl[:, :1] * ax
    for j in range(N_PRIMS):
        if PO[j] != 0:
            continue
        b = PB[j]
        if b in AX_BONES and PC[j] in (0, 1) and b not in (B['head'],):
            # primitivas do tronco seguem a mesma regra axial do corpo
            W += infl[:, j + 1:j + 2] * ax
        else:
            W[:, b] += infl[:, j + 1]
    # 4 maiores
    idx = np.argsort(-W, axis=1)[:, :4]
    wt = np.take_along_axis(W, idx, axis=1)
    wt /= wt.sum(axis=1, keepdims=True) + 1e-12
    q = np.round(wt * 255).astype(np.int64)
    q[:, 0] += 255 - q.sum(axis=1)

    # ── regiões para as escamas: cabeça, barriga, membro/dedo, cauda
    cls_of = np.concatenate([[0], PC])
    dom = np.argmin(pd, axis=1)
    dom_cls = cls_of[dom]
    zmid = np.interp(np.clip(yv, TAB_Y0, TAB_Y1), _ys, TAB[:, 2])
    head = np.clip((yv - 0.73) / 0.03, 0, 1) * (dom_cls != 2) * (dom_cls != 3)
    limb = ((dom_cls == 2) | (dom_cls == 3)).astype(float)
    belly = np.clip((-normals[:, 2] - 0.15) / 0.4, 0, 1) * (1 - limb) * np.clip((zmid - verts[:, 2]) / 0.01 + 0.5, 0, 1)
    tail = np.clip((-yv - 0.02) / 0.06, 0, 1) * (1 - limb)
    region = np.stack([head, belly, limb, tail], 1)
    region = np.round(np.clip(region, 0, 1) * 255).astype(np.uint8)

    # ── exporta: cabeçalho JSON + buffers binários
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    nv = len(verts)
    pos = verts.astype(np.float32)
    nrm = np.round(normals * 32767).astype(np.int16)
    nrm4 = np.zeros((nv, 4), np.int16)
    nrm4[:, :3] = nrm
    sk_i = idx.astype(np.uint8)
    sk_w = q.astype(np.uint8)
    ind = faces.astype(np.uint16 if nv < 65536 else np.uint32)
    eyes = []
    for sx in (-1, 1):
        c, a = EYE[sx]
        eyes.append({'center': [round(float(v), 5) for v in c], 'radius': 0.0198, 'axis': [round(float(v), 4) for v in a]})
    header = {
        'version': 1,
        'units': 'CRC',
        'vertexCount': nv,
        'indexCount': int(ind.size),
        'indexType': 'uint16' if ind.dtype == np.uint16 else 'uint32',
        'bones': [{'name': n, 'parent': int(p), 'position': [round(float(v), 5) for v in pos_]} for n, p, pos_ in BONES],
        'limbs': {k: list(v) for k, v in LIMBS.items()},
        'eyes': eyes,
        'bbox': [verts.min(0).round(4).tolist(), verts.max(0).round(4).tolist()],
        'layout': ['position:f32x3', 'normal:i16x4', 'region:u8x4', 'skinIndex:u8x4', 'skinWeight:u8x4', 'index'],
    }
    hj = json.dumps(header, separators=(',', ':')).encode()
    hj += b' ' * ((4 - len(hj) % 4) % 4)
    with open(OUT, 'wb') as f:
        f.write(b'CLNG')
        f.write(struct.pack('<I', len(hj)))
        f.write(hj)
        for arr in (pos, nrm4, region, sk_i, sk_w):
            f.write(arr.tobytes())
        f.write(ind.tobytes())
        pad = (4 - f.tell() % 4) % 4
        f.write(b'\0' * pad)
    print(f'ok: {OUT} ({os.path.getsize(OUT)/1024:.0f} KB), {nv} vértices, {len(faces)} triângulos, {nb} ossos', file=sys.stderr)
    np.savez_compressed(os.environ.get('DEBUG_NPZ', '/tmp/calango-debug.npz'), verts=verts, faces=faces, normals=normals, skin_i=idx, skin_w=wt, region=region,
                        eyes=np.array([[*EYE[sx][0], 0.0198] for sx in (-1, 1)]))


if __name__ == '__main__':
    main()
