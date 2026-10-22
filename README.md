# Tudo o que não somos

Exposição digital da direção de arte de **Lucas Lopes** para o **Abigos FR**: a campanha Sangue-Frio, os reforços, os confrontos e a identidade do clube, criados com IA no Higgsfield.

**No ar:** https://portifolio-ll.vercel.app

> *Everything I'm not made me everything I am.*

## A experiência, em atos

| Ato | O que acontece | Referência |
| --- | --- | --- |
| Boot | A tela abre desfocada e entra em foco em 1 s | — |
| Title screen | Um painel de vidro em 3/4, com o escudo oficial e o título impressos nele; atrás, um terminal de dados animado em paralaxe (log, espécime, radar, ondas); a luz segue o mouse e revela os riscos | Title screen de Cyberpunk 2077 |
| Hacking | A música entra em fade no 0:09 e estabiliza no 0:14; nesses 5 s o acervo é "descriptografado" e o calango minimalista se forma em caracteres. Numa conexão lenta, a entrada não espera a trilha mais que 5 s: a música entra quando chegar, no ponto em que a abertura estiver | — |
| O idealizador | O calango de código voa do hacking para o canto da tela e um convite pulsante pede para rolar; a foto do Lucas encolhe para uma moldura de museu, vira P&B e recebe a assinatura; o nome entra em foco | landonorris.com |
| Manifesto | As frases trocam com a rolagem, sem trava: cada uma pede meia tela (uma rolada de trackpad ou uma deslizada no celular, mais ou menos). Tudo o que o time *não* é chega em baixa resolução e é tarjado, como num documento sigiloso; só a última frase entra em foco. No campo vazio à direita, sempre no mesmo lugar, o logo do calango em vidro grosso gira devagar no próprio eixo, refratando a página, com um data overlay lendo a forma dele; com o cursor em cima, ele vira para o visitante e a luz acompanha o ponteiro; no fundo, o acervo pisca em rajadas de 3 a 5 fotos emendadas, cada uma por 0,3 s, com um respiro escuro entre as rajadas | kinoria.studio · a letra S de vidro do Panter Vision |
| Sala 01 · Sangue-Frio | O filme ao lado da decupagem impressa (o marca-texto acompanha o plano que está passando; ele só começa a baixar quando o visitante chega perto); depois, as peças entram pela lateral enquanto o céu passa por um dia inteiro no sertão, cada uma com seu cabeçalho de cena | — |
| Sala 02 · Reforços | Cada anúncio é um registro do BID (Boletim Informativo Diário); o carimbo "Regularizado" bate quando a ficha aparece | — |
| Sala 03 · Confrontos | Painel de LED de estação: "Próximas partidas" (partida é jogo e é embarque), com a situação calculada pela data | O letreiro do pôster *Próxima Estação* |
| Sala 04 · Identidade | A camisa Casa numa vitrine de vidro: o reflexo acompanha o mouse | — |
| Sobre | O Lucas entra como personagem de roteiro: "LUCAS LOPES (21)" | — |
| Fechamento | "Tudo o que não somos" perde o foco enquanto "nos fez tudo o que somos." entra em foco; depois, um contrato de transferência já assinado pelo Lucas, e a linha do contratante é o botão **Vamos trabalhar juntos** | — |

Cada peça abre uma **ficha da obra**: o processo criativo como fala em off do diretor e as notas de produção. Em *Epiderme* e *Rural* há uma lupa para inspecionar a imperfeição; em *Gume*, um comparador entre o escudo original e o novo. No Índice, **Todas as peças** abre a ficha da primeira, e as setas percorrem o acervo inteiro.

## O calango de vidro

O logo minimalista do calango, extrudado como uma peça grossa de vidro, no estilo das letras de vidro:

- `scripts/glass-calango.py` transforma a silhueta do logo (`src/assets/calango.ts`) num sólido de bordas arredondadas, com o olho e as listras gravados, e gera `public/media/3d/calango-vidro.bin` (a malha) e `calango-vidro-campo.png` (o mapa que dá a normal exata de cada pixel), mais as versões que o site baixa, compactadas sem perda (`calango-vidro.bin.gz` e `calango-vidro-campo.webp`: os mesmos dados, cerca de um terço menores; os originais ficam de reserva). Precisa de Python com `numpy`, `scipy`, `numba`, `scikit-image`, `fast-simplification` e `Pillow`: `python3 scripts/glass-calango.py` (o raio do chanfro, 10 unidades, muda com a variável `BEVEL`).
- No site (`src/components/glass/`), o raio atravessa a espessura e refrata duas vezes, cada comprimento de onda com seu índice (as bordas abrem em arco-íris), e o reflexo é de um estúdio de tiras de luz. O que aparece atrás do vidro é uma réplica do manifesto desenhada numa textura, nas mesmas posições da tela.
- A peça não sai do lugar e o giro não depende da rolagem: ela gira devagar em torno do próprio eixo vertical, uma volta a cada 32 s (`src/components/glass/spin.ts`). Com movimento reduzido, fica parada.
- Interação, nos padrões que o 21st.dev usa para objetos que respondem ao ponteiro (Tilt, Optimized Tilt Card, Interactive Globe): com o cursor em cima, ela para, vira de frente para o visitante, inclina na direção do ponteiro e um reflexo acompanha o cursor; arrastar gira, com inércia ao soltar; no celular, tocar segura a peça e deslizar para o lado gira. Quando ninguém mexe, o giro lento volta.
- O data overlay projeta da peça 3D o focinho, o olho, as patas, a cauda e a espinha a cada leitura (12 por segundo); com o cursor em cima, trava no alvo e mira a parte do desenho mais perto do ponteiro.
- Num aparelho que não segura o ritmo, só a peça passa a renderizar com menos pixels; o resto da página não muda.
- Para não pesar: o canvas do vidro cobre só a caixa onde a peça pode aparecer (em qualquer giro e inclinação), não a tela inteira, e o do data overlay cobre a peça e a folga das legendas; a câmera continua a do palco inteiro. Na réplica da página, o texto fica numa camada própria: um flash que troca só remonta fundo, foto e texto, sem medir a página. As fotos do acervo ficam prontas para o vidro antes de piscar (decodificadas e recortadas fora da thread principal, com o navegador ocioso).

## O fundo topográfico

Das salas em diante, o preto chapado ganha curvas de nível sutis, como um mapa topográfico que se revolve devagar (`src/components/topo/`):

- O relevo é um campo de ruído simplex com os gradientes girando (flow noise: as ilhas encolhem e se refazem no lugar, sem deslizar), andando menos de 2 px por segundo. A cada cinco curvas, uma mestra, um pouco mais firme, como nos mapas. A tinta é o osso do site nas baixadas e puxa para o verde do calango nos altos, sempre com pouquíssimo contraste. Grão por pixel da tela e dither contra banding no fim.
- Duas passadas: o relevo é calculado numa grade quatro vezes menor (o campo é suave) e as linhas são desenhadas na resolução da tela a partir dele. Isso custa cerca de um terço de calcular tudo na resolução cheia.
- Para não pesar: os shaders ficam prontos ainda na tela de abertura (compilados com o navegador ocioso e com um primeiro desenho invisível), para nenhum engasgo cair na rolagem; desenha no máximo 24 vezes por segundo, para enquanto a página rola (a GPU fica toda para a rolagem), com a aba oculta, com a ficha ou o índice abertos e quando não está à vista; sai enquanto o céu da galeria do dia está claro. Num aparelho que não segura o ritmo, passa a desenhar menos pixels. Com "reduzir movimento", fica parado num quadro só.
- Os shaders seguem a skill `shader-art-coding` (em `.claude/skills/`): `shaders/field.glsl` (o relevo) e `shaders/lines.glsl` (linhas, cor, grão) usam a biblioteca dela pelo nome. As constantes no alto de cada um controlam escala, intervalo entre curvas, cor, força das linhas, grão e movimento. Depois de mexer, gere e confira as versões que o site usa:

```bash
cd .claude/skills/shader-art-coding
python3 scripts/glsl_tools.py bundle ../../../src/components/topo/shaders/field.glsl -o ../../../src/components/topo/shaders/field.bundle.glsl
python3 scripts/glsl_tools.py bundle ../../../src/components/topo/shaders/lines.glsl -o ../../../src/components/topo/shaders/lines.bundle.glsl
python3 scripts/glsl_tools.py check ../../../src/components/topo/shaders/*.bundle.glsl
```

No console (só no `npm run dev`): `__topo.debug(5)` mostra só as linhas, em contraste cheio; `__topo.debug(0)` volta ao normal.

## A tipografia

Três vozes, todas SIL Open Font License:

- **Redaction** (as obras): uma serifa com seis graus de degradação em pixel. O que "não somos" fica em baixa resolução; o que somos entra em foco (`src/components/type/Resolve.tsx`).
- **Courier Prime** (o curador): a Courier refeita para roteiros. Daí os cabeçalhos de cena, as falas em off e a decupagem.
- **Doto** (a máquina): matriz de pontos, no placar e no timecode.

A assinatura usa Mrs Saint Delafield (OFL).

## Rodar no computador

```bash
npm install
npm run dev
```

Abra o endereço que aparecer no terminal (geralmente `http://localhost:5173`).

Atalhos de desenvolvimento (só no `npm run dev`):

- `?direto` pula a abertura e vai direto ao site.

No console do navegador (também só no `npm run dev`): `__glass.freeze(1.2)` congela o calango num ângulo, em radianos (`__glass.freeze(null)` solta).

## Publicar na Vercel

O site já está publicado em https://portifolio-ll.vercel.app. A cada commit na branch de produção (a branch padrão do repositório, `claude/abigos-portfolio-site-xd71so`), a Vercel gera o site de novo e troca a versão no ar em um ou dois minutos. Commits em outras branches viram links de prévia, sem mexer no site principal.

Para publicar do zero em outra conta:

1. No GitHub, deixe como branch padrão a branch que tem o site (**Settings → General → Default branch**).
2. Entre em [vercel.com](https://vercel.com) com a conta do GitHub, **Add New → Project** e importe o repositório.
3. A Vercel detecta Vite sozinha (`npm run build`, pasta `dist`; veja `vercel.json`). Clique em **Deploy**.
4. Em **Settings → Domains**, troque o endereço ou conecte um domínio próprio. Se trocar, atualize o endereço nas tags `og:` do `index.html` (a prévia de compartilhamento usa o link completo).

## Onde mexer

- **Textos das peças, salas, manifesto e sobre** (inclusive os cabeçalhos de cena, a decupagem do filme e os registros do BID): `src/data/pieces.ts`
- **Ritmo do manifesto** (rolagem por frase: a altura da seção em `manifesto.css` e `ABOUT_SHARE`; flashes: `FLASH_HOLD`, `flashBurst`, `flashGap`) e lugar do calango de vidro: `src/components/sections/Manifesto.tsx`
- **Contato (WhatsApp, e-mail), música e tempos da abertura:** `src/data/site.ts`
- **Novas imagens:** coloque o original em `media-src/img/` e rode `npm run media`. O script gera AVIF, WebP e JPG em três tamanhos e atualiza `src/data/media-manifest.json`.
- **Novo filme:** `npm run video media-src/video/arquivo.mp4 15.6` (gera WebM, MP4 e o pôster no segundo indicado; precisa de ffmpeg).
- **Escudo da title screen:** `python3 scripts/cut-crest.py` recorta o escudo oficial (`media-src/crest/logo-abigos-principal.jpg`) sem o círculo verde.

## Técnica

React + Vite + TypeScript · GSAP (ScrollTrigger) · Lenis · three.js (shaders próprios no calango de vidro) · Web Audio API · WebGL puro na title screen e no fundo topográfico · componentes do [21st.dev](https://21st.dev) como base (galeria com cartões girando).
