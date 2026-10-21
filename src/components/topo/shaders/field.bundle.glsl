// Fundo topográfico, passada 1 de 2 (Buffer A no Shadertoy): o relevo.
// Um campo de altura suave, de duas oitavas de simplex com os gradientes girando (flow noise: o relevo
// se revolve no lugar em vez de deslizar), mais um deslize lento do mapa inteiro. Sai empacotado em
// RGBA8, que qualquer GPU renderiza e filtra: altura em 16 bits (R alto, G baixo) e o gradiente
// analítico em BA. A passada das linhas lê isso em baixa resolução (o campo é suave e a interpolação
// bilinear basta) e desenha traços de largura constante sem derivadas de tela.
// @render time=24.0
#ifndef DEBUG_MODE
#define DEBUG_MODE 0 // 0 campo empacotado | 1 altura | 2 inclinação
#endif

// Library code below is bundled from shader-skills (MIT): https://github.com/gokayfem/shader-skills
// ---- shader-skills library: common ----
const float TAU = 6.28318530717959;
// 2D rotation matrix. `rot2(a) * v` rotates v counter-clockwise by a radians. (cos, sin) is renormalized because GLSL ES leaves trig precision undefined: on SwiftShader and some mobile GPUs a raw cos/sin pair is far enough from unit length that rotations stop preserving distances.
mat2 rot2(float a) {
    vec2 cs = normalize(vec2(cos(a), sin(a)));
    return mat2(cs.x, cs.y, -cs.y, cs.x);
}

// ---- shader-skills library: hash ----
// PCG-style 1D integer hash.
uint pcgHash(uint v) {
    uint state = v * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}
// Map a uint to [0,1) using the top 24 bits, so the result can never round up to 1.0.
float uintToUnit(uint h) { return float(h >> 8u) * (1.0 / 16777216.0); }
vec2 uintToUnit(uvec2 h) { return vec2(h >> 8u) * (1.0 / 16777216.0); }
vec3 uintToUnit(uvec3 h) { return vec3(h >> 8u) * (1.0 / 16777216.0); }
vec4 uintToUnit(uvec4 h) { return vec4(h >> 8u) * (1.0 / 16777216.0); }
// Random float in [0,1) for an integer-valued 2D input.
float hash12(vec2 p) {
    uvec2 q = uvec2(ivec2(floor(p)));
    return uintToUnit(pcgHash(q.x + pcgHash(q.y)));
}

// ---- shader-skills library: noise ----
// Unit gradient for a 2D lattice point.
vec2 latticeGradient(vec2 cell) {
    float a = TAU * hash12(cell);
    return vec2(cos(a), sin(a));
}
// 2D simplex noise with analytic gradient. Returns vec3(value, d/dx, d/dy). Sums three radial kernels (0.5 - r^2)^4 on a triangular lattice instead of blending four square-cell corners, so it has fewer axis-aligned artifacts than gradientNoise. rotation (radians) spins every lattice gradient: animating it gives flow noise that churns in place instead of sliding (Perlin and Neyret 2001). Scaled so |value| <= 1 exactly.
vec3 simplexNoiseD(vec2 p, float rotation) {
    const float SKEW = 0.36602540378;     // (sqrt(3) - 1) / 2: square lattice -> triangle lattice
    const float UNSKEW = 0.21132486541;   // (3 - sqrt(3)) / 6
    vec2 cell = floor(p + (p.x + p.y) * SKEW);
    vec2 d0 = p - cell + (cell.x + cell.y) * UNSKEW;
    vec2 o = (d0.x > d0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);   // which of the cell's two triangles holds p
    vec2 corners[3] = vec2[3](cell, cell + o, cell + 1.0);
    vec2 offsets[3] = vec2[3](d0, d0 - o + UNSKEW, d0 - 1.0 + 2.0 * UNSKEW);
    mat2 spin = rot2(rotation);
    vec3 sum = vec3(0.0);
    for (int k = 0; k < 3; k++) {
        vec2 d = offsets[k];
        float t = max(0.5 - dot(d, d), 0.0);
        vec2 g = spin * latticeGradient(corners[k]);
        float gd = dot(g, d);
        float t3 = t * t * t;
        // value t^4 (g.d); gradient t^4 g - 8 t^3 (g.d) d
        sum += vec3(t3 * t * gd, t3 * t * g - 8.0 * t3 * gd * d);
    }
    return 99.2 * sum;   // 1 / max over the simplex of sum t^4 |d|
}
vec3 simplexNoiseD(vec2 p) { return simplexNoiseD(p, 0.0); }

// ---- shader ----
// --- forma
const float FIELD_SCALE = 1.15;         // relevos por meia altura de tela: maior = ilhas menores e mais juntas
const float LACUNARITY = 2.07;          // frequência da segunda oitava (não inteira, para não alinhar)
const float GAIN = 0.38;                // peso da segunda oitava: o detalhe nas encostas
const vec2 OFFSET2 = vec2(17.3, -9.1);  // descorrela as duas oitavas

// --- movimento (por segundo)
const float SPIN1 = 0.021;              // giro dos gradientes da oitava larga, em radianos
const float SPIN2 = -0.033;             // a fina gira ao contrário: o relevo se revolve sem um sentido só
const vec2 DRIFT = vec2(0.0048, -0.003); // deslize do mapa, em unidades de campo

// --- empacotamento (tem de bater com lines.glsl)
const float H_RANGE = 1.38;             // |altura| máxima: 1 + GAIN
const float G_MAX = 12.0;               // |gradiente| máximo guardado, em unidades de uv

// altura e gradiente (em uv) do relevo no instante t
vec3 relief(vec2 uv, float t) {
    vec2 p = uv * FIELD_SCALE + DRIFT * t;
    vec3 a = simplexNoiseD(p, SPIN1 * t);
    vec3 b = simplexNoiseD(p * LACUNARITY + OFFSET2, SPIN2 * t);
    float h = a.x + GAIN * b.x;
    vec2 g = (a.yz + GAIN * LACUNARITY * b.yz) * FIELD_SCALE;
    return vec3(h, g);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
    vec3 f = relief(uv, iTime);
    float v = clamp(0.5 + 0.5 * f.x / H_RANGE, 0.0, 1.0) * 255.0;
    vec2 g = clamp(0.5 + 0.5 * f.yz / G_MAX, 0.0, 1.0);
    fragColor = vec4(floor(v) / 255.0, fract(v), g);
#if DEBUG_MODE == 1
    fragColor = vec4(vec3(v / 255.0), 1.0);
#elif DEBUG_MODE == 2
    fragColor = vec4(vec3(length(f.yz) / G_MAX), 1.0);
#endif
}
