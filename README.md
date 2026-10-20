# Tudo o que não somos

Exposição digital da direção de arte de **Lucas Lopes** para o **Abigos FR**: a campanha Sangue-Frio, os reforços, os confrontos e a identidade do clube, criados com IA no Higgsfield.

**No ar:** https://portifolio-ll.vercel.app

> *Everything I'm not made me everything I am.*

## A experiência, em atos

| Ato | O que acontece | Referência |
| --- | --- | --- |
| Boot | A tela abre desfocada e entra em foco em 1 s | — |
| Title screen | Um painel de vidro em 3/4, com o escudo oficial e o título impressos nele; atrás, um terminal de dados animado em paralaxe (log, espécime, radar, ondas); a luz segue o mouse e revela os riscos | Title screen de Cyberpunk 2077 |
| Hacking | A música entra em fade no 0:09 e estabiliza no 0:14; nesses 5 s o acervo é "descriptografado" e o calango minimalista se forma em caracteres | — |
| O idealizador | O calango de código voa do hacking para o canto da tela e um convite pulsante pede para rolar; a foto do Lucas encolhe para uma moldura de museu, vira P&B e recebe a assinatura; o nome entra em foco | landonorris.com |
| Manifesto | A página para (só na primeira vez, e só para baixo) e as frases passam sozinhas, cerca de 2 s cada: tudo o que o time *não* é chega em baixa resolução e é tarjado, como num documento sigiloso; só a última frase entra em foco. Ao lado, o logo do calango em vidro grosso gira refratando as letras, com um data overlay lendo a forma dele; no fundo, o acervo pisca | kinoria.studio · a letra S de vidro do Panter Vision |
| Sala 01 · Sangue-Frio | O filme ao lado da decupagem impressa (o marca-texto acompanha o plano que está passando); depois, as peças entram pela lateral enquanto o céu passa por um dia inteiro no sertão, cada uma com seu cabeçalho de cena | — |
| Sala 02 · Reforços | Cada anúncio é um registro do BID (Boletim Informativo Diário); o carimbo "Regularizado" bate quando a ficha aparece | — |
| Sala 03 · Confrontos | Painel de LED de estação: "Próximas partidas" (partida é jogo e é embarque), com a situação calculada pela data | O letreiro do pôster *Próxima Estação* |
| Sala 04 · Identidade | A camisa Casa numa vitrine de vidro: o reflexo acompanha o mouse | — |
| Sobre | O Lucas entra como personagem de roteiro: "LUCAS LOPES (21)" | — |
| Fechamento | "Tudo o que não somos" perde o foco enquanto "nos fez tudo o que somos." entra em foco; depois, um contrato de transferência já assinado pelo Lucas, e a linha do contratante é o botão **Vamos trabalhar juntos** | — |

Cada peça abre uma **ficha da obra**: o processo criativo como fala em off do diretor e as notas de produção. Em *Epiderme* e *Rural* há uma lupa para inspecionar a imperfeição; em *Gume*, um comparador entre o escudo original e o novo.

De tempos em tempos (a cada ~12 s de rolagem), a página é "lida" por um instante: duas a quatro coisas na tela ganham caixa de rastreamento, coordenadas e setas tracejadas (`src/components/hud/ScanOverlay.tsx`).

## O calango de vidro

O logo minimalista do calango, extrudado como uma peça grossa de vidro, no estilo das letras de vidro:

- `scripts/glass-calango.py` transforma a silhueta do logo (`src/assets/calango.ts`) num sólido de bordas arredondadas, com o olho e as listras gravados, e gera `public/media/3d/calango-vidro.bin` (a malha) e `calango-vidro-campo.png` (o mapa que dá a normal exata de cada pixel). Precisa de Python com `numpy`, `scipy`, `numba`, `scikit-image`, `fast-simplification` e `Pillow`: `python3 scripts/glass-calango.py` (o raio do chanfro, 10 unidades, muda com a variável `BEVEL`).
- No site (`src/components/glass/`), o raio atravessa a espessura e refrata duas vezes, cada comprimento de onda com seu índice (as bordas abrem em arco-íris), e o reflexo é de um estúdio de tiras de luz. O que aparece atrás do vidro é uma réplica do manifesto desenhada numa textura, nas mesmas posições da tela.
- O giro não depende da rolagem: são quadros-chave num laço de 14 s (balança, encara a câmera, dá uma volta inteira e deita para trás). Com movimento reduzido, a peça fica parada.
- O data overlay projeta da peça 3D o focinho, o olho, as patas, a cauda e a espinha a cada leitura (12 por segundo).
- Num aparelho que não segura o ritmo, só a peça passa a renderizar com menos pixels; o resto da página não muda.

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

No console do navegador (também só no `npm run dev`): `__gate(null)` libera o portão do manifesto, `__glass.freeze(3.5)` congela o giro do calango num instante (`__glass.freeze(null)` solta) e `__scan.fire()` dispara a próxima leitura do data overlay.

## Publicar na Vercel

O site já está publicado em https://portifolio-ll.vercel.app. A cada commit na branch de produção (a branch padrão do repositório, `claude/abigos-portfolio-site-xd71so`), a Vercel gera o site de novo e troca a versão no ar em um ou dois minutos. Commits em outras branches viram links de prévia, sem mexer no site principal.

Para publicar do zero em outra conta:

1. No GitHub, deixe como branch padrão a branch que tem o site (**Settings → General → Default branch**).
2. Entre em [vercel.com](https://vercel.com) com a conta do GitHub, **Add New → Project** e importe o repositório.
3. A Vercel detecta Vite sozinha (`npm run build`, pasta `dist`; veja `vercel.json`). Clique em **Deploy**.
4. Em **Settings → Domains**, troque o endereço ou conecte um domínio próprio. Se trocar, atualize o endereço nas tags `og:` do `index.html` (a prévia de compartilhamento usa o link completo).

## Onde mexer

- **Textos das peças, salas, manifesto e sobre** (inclusive os cabeçalhos de cena, a decupagem do filme e os registros do BID): `src/data/pieces.ts`
- **Tempo das frases do manifesto** (`STEP`, `TRUTH_HOLD`) e lugar do calango de vidro: `src/components/sections/Manifesto.tsx`
- **Contato (WhatsApp, e-mail), música e tempos da abertura:** `src/data/site.ts`
- **Novas imagens:** coloque o original em `media-src/img/` e rode `npm run media`. O script gera AVIF, WebP e JPG em três tamanhos e atualiza `src/data/media-manifest.json`.
- **Novo filme:** `npm run video media-src/video/arquivo.mp4 15.6` (gera WebM, MP4 e o pôster no segundo indicado; precisa de ffmpeg).
- **Escudo da title screen:** `python3 scripts/cut-crest.py` recorta o escudo oficial (`media-src/crest/logo-abigos-principal.jpg`) sem o círculo verde.

## Técnica

React + Vite + TypeScript · GSAP (ScrollTrigger) · Lenis · three.js (shaders próprios no calango de vidro) · Web Audio API · WebGL puro na title screen · componentes do [21st.dev](https://21st.dev) como base (galeria com cartões girando).
