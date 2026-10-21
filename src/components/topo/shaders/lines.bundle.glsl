// Fundo topográfico, passada 2 de 2 (Image no Shadertoy; iChannel0 = Buffer A, com filtro linear).
// Desenha, na resolução da tela, as curvas de nível do relevo empacotado na passada 1. O traço tem
// largura constante porque a distância até a curva vem da altura dividida pelo gradiente analítico
// (sem derivadas de tela). A cada cinco curvas, a mestra, um pouco mais firme, como nos mapas. Onde a
// encosta é tão íngreme que as curvas encostam umas nas outras, elas se apagam antes de serrilhar.
// Sai em alfa pré-multiplicado: tinta clara sobre transparente, para o canvas ficar por cima do fundo
// do site sem precisar saber a cor dele (no preto aparece; num fundo claro, some sozinha). O grão é
// por pixel e por quadro; o dither TPDF vem por último, contra o banding dos tons quase pretos.
// @render time=24.0
#ifndef DEBUG_MODE
#define DEBUG_MODE 0 // 0 final (pré-multiplicado) | 5 máscara das linhas, contraste cheio | 7 prévia sobre o preto do site
#endif

// Library code below is bundled from shader-skills (MIT): https://github.com/gokayfem/shader-skills
// ---- shader-skills library: hash ----
// PCG-style 1D integer hash.
uint pcgHash(uint v) {
    uint state = v * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}
// 3D integer hash, three decorrelated outputs.
uvec3 pcg3d(uvec3 v) {
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> 16u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}
// Map a uint to [0,1) using the top 24 bits, so the result can never round up to 1.0.
float uintToUnit(uint h) { return float(h >> 8u) * (1.0 / 16777216.0); }
vec2 uintToUnit(uvec2 h) { return vec2(h >> 8u) * (1.0 / 16777216.0); }
vec3 uintToUnit(uvec3 h) { return vec3(h >> 8u) * (1.0 / 16777216.0); }
vec4 uintToUnit(uvec4 h) { return vec4(h >> 8u) * (1.0 / 16777216.0); }
// Random float in [0,1) for an integer-valued 3D input.
float hash13(vec3 p) {
    uvec3 q = uvec3(ivec3(floor(p)));
    return uintToUnit(pcgHash(q.x + pcgHash(q.y + pcgHash(q.z))));
}
// Random vec2 in [0,1)^2 for an integer-valued 2D input.
vec2 hash22(vec2 p) {
    ivec2 q = ivec2(floor(p));
    return uintToUnit(pcg3d(uvec3(q.x, q.y, 0x2545u))).xy;
}

// ---- shader-skills library: post ----
// Antialiased fill of a 2D SDF: 1 inside, 0 outside, box-filtered across one pixel. Uses screen derivatives, so call it outside non-uniform branches and loops. For a fixed pixel size use fillAA(d, px).
float fillAA(float d) {
    float w = length(vec2(dFdx(d), dFdy(d)));
    return clamp(0.5 - d / max(w, 1e-6), 0.0, 1.0);
}
// Antialiased fill with an explicit pixel size px (e.g. 2.0 / iResolution.y for the standard uv). Safe in loops and branches.
float fillAA(float d, float px) { return clamp(0.5 - d / px, 0.0, 1.0); }
// Antialiased stroke of half-width hw around the zero line of a 2D SDF.
float strokeAA(float d, float hw, float px) { return fillAA(abs(d) - hw, px); }
// Triangular-PDF dither of +-1 LSB for 8-bit output. Add AFTER linearToSrgb, right before writing fragColor.
vec3 ditherTPDF(vec2 fragCoord, int frame) {
    vec2 r = hash22(vec2(floor(fragCoord) + 7919.0 * float(frame % 1024)));
    return vec3((r.x + r.y - 1.0) / 255.0);
}

// ---- shader ----
// --- desenho
const float INTERVAL = 0.2;             // altura entre curvas: menor = mais linhas
const float HALF_WIDTH = 0.0011;        // meia largura do traço, em uv (~1 px CSS de traço numa tela de 900 px)
const float INDEX_EVERY = 5.0;          // de quantas em quantas curvas vem a mestra
const float INDEX_WIDTH = 1.45;         // a mestra é um pouco mais grossa...

// --- cor (sRGB: a mistura com o fundo acontece no compositor do navegador)
const vec3 INK_LOW = vec3(0.86, 0.85, 0.79);   // nas baixadas, o osso do site
const vec3 INK_HIGH = vec3(0.70, 0.84, 0.58);  // nos altos, o osso puxado para o verde do calango
const float LINE_ALPHA = 0.055;         // força da curva comum
const float INDEX_ALPHA = 0.09;         // ...e a mestra, um pouco mais clara
const float LOWLAND_FADE = 0.55;        // nas baixadas a linha fica com esta fração da força
const float GRAIN = 0.011;              // grão: até ~3/255 de tinta clara por pixel

// --- prévia
const vec3 SITE_BG = vec3(0.027, 0.031, 0.027); // #070807, o preto do site (só no DEBUG 7)

// --- empacotamento (tem de bater com field.glsl)
const float H_RANGE = 1.38;
const float G_MAX = 12.0;

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec4 s = texture(iChannel0, fragCoord / iResolution.xy);
    float h = ((s.r * 255.0 + s.g) / 127.5 - 1.0) * H_RANGE;
    vec2 g = (s.ba * 2.0 - 1.0) * G_MAX;
    float px = 2.0 / iResolution.y;

    // distância até a curva mais próxima: em altura, dividida pela inclinação
    float slope = max(length(g), 1e-4);
    float level = h / INTERVAL;
    float k = floor(level + 0.5);
    float d = abs(level - k) * INTERVAL / slope;
    float isIndex = step(mod(k, INDEX_EVERY), 0.5);
    float hw = HALF_WIDTH * mix(1.0, INDEX_WIDTH, isIndex);
    float lineW = 2.0 * hw / px;            // largura do traço, em pixels
    float spacing = INTERVAL / slope / px;  // pixels entre duas curvas vizinhas
    float line = strokeAA(d, hw, px) * smoothstep(1.5 * lineW, 4.0 * lineW, spacing);

    // os altos do relevo, um pouco mais claros e mais verdes que as baixadas
    float high = smoothstep(-0.55, 0.85, h / H_RANGE);
    float a = line * mix(LINE_ALPHA, INDEX_ALPHA, isIndex) * mix(LOWLAND_FADE, 1.0, high);
    vec3 ink = mix(INK_LOW, INK_HIGH, high);
    float grain = GRAIN * hash13(vec3(fragCoord, float(iFrame)));

    // pré-multiplicado, com o dither por último
    vec3 rgb = ink * a + INK_LOW * grain;
    float alpha = a + grain;
    rgb = max(rgb + ditherTPDF(fragCoord, iFrame), 0.0);
    alpha = max(alpha, max(rgb.r, max(rgb.g, rgb.b)));
    fragColor = vec4(rgb, alpha);
#if DEBUG_MODE == 5
    fragColor = vec4(vec3(line), 1.0);
#elif DEBUG_MODE == 7
    fragColor = vec4(SITE_BG * (1.0 - alpha) + rgb, 1.0);
#endif
}
