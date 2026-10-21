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
