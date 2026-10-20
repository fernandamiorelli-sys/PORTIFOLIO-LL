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
| O idealizador | A foto do Lucas encolhe para uma moldura de museu, vira P&B e recebe a assinatura; o nome entra em foco. Na saída, cada caractere do calango de código voa até a pele do calango 3D | landonorris.com |
| Manifesto | Tudo o que o time *não* é chega em baixa resolução e é tarjado, como num documento sigiloso; só a última frase entra em foco. O calango responde com flexões | kinoria.studio |
| Sala 01 · Sangue-Frio | O filme ao lado da decupagem impressa (o marca-texto acompanha o plano que está passando); depois, as peças entram pela lateral enquanto o céu passa por um dia inteiro no sertão, cada uma com seu cabeçalho de cena | — |
| Sala 02 · Reforços | Cada anúncio é um registro do BID (Boletim Informativo Diário); o carimbo "Regularizado" bate quando a ficha aparece | — |
| Sala 03 · Confrontos | Painel de LED de estação: "Próximas partidas" (partida é jogo e é embarque), com a situação calculada pela data | O letreiro do pôster *Próxima Estação* |
| Sala 04 · Identidade | O calango atravessa a vitrine e volta para casa: o patch da camisa | — |
| Sobre | O Lucas entra como personagem de roteiro: "LUCAS LOPES (21)" | — |
| Fechamento | "Tudo o que não somos" perde o foco enquanto "nos fez tudo o que somos." entra em foco; depois, um contrato de transferência já assinado pelo Lucas, e a linha do contratante é o botão **Vamos trabalhar juntos** | — |

Cada peça abre uma **ficha da obra**: o processo criativo como fala em off do diretor e as notas de produção. Em *Epiderme* e *Rural* há uma lupa para inspecionar a imperfeição; em *Gume*, um comparador entre o escudo original e o novo.

## O calango

O mascote minimalista vira um calango de verdade (*Tropidurus hispidus*), esculpido proceduralmente:

- `scripts/sculpt-calango.py` monta o corpo como campo de distância (cabeça triangular, órbitas, pálpebras, ouvido, cinco dedos com o quarto dedo posterior longo, cauda de 1,5 CRC), extrai a malha e calcula os pesos de pele. Gera `public/media/3d/calango.bin`. Precisa de Python com `numpy`, `numba`, `scikit-image` e `fast-simplification`: `python3 scripts/sculpt-calango.py`.
- No site, ele é cromo com película iridescente e escamas procedurais, anda com a marcha diagonal dos lagartos (patas com IK), olha para o cursor, foge quando o mouse passa rápido, faz flexões quando é clicado e passeia pela página.
- Cada seção marca onde ele fica com atributos `data-calango` (veja o comentário no topo de `src/components/three/Stage.tsx`).

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

- `?direto` pula a abertura e vai direto ao site;
- `?bancada` abre a bancada do calango (`&walk`, `&tilt=40`, `&size=0.3`, `&heading=90`);
- `?leve` força o modo econômico do 3D; `?alta` força o completo (vale também no site publicado).

## Publicar na Vercel

O site já está publicado em https://portifolio-ll.vercel.app. A cada commit na branch de produção (a branch padrão do repositório, `claude/abigos-portfolio-site-xd71so`), a Vercel gera o site de novo e troca a versão no ar em um ou dois minutos. Commits em outras branches viram links de prévia, sem mexer no site principal.

Para publicar do zero em outra conta:

1. No GitHub, deixe como branch padrão a branch que tem o site (**Settings → General → Default branch**).
2. Entre em [vercel.com](https://vercel.com) com a conta do GitHub, **Add New → Project** e importe o repositório.
3. A Vercel detecta Vite sozinha (`npm run build`, pasta `dist`; veja `vercel.json`). Clique em **Deploy**.
4. Em **Settings → Domains**, troque o endereço ou conecte um domínio próprio. Se trocar, atualize o endereço nas tags `og:` do `index.html` (a prévia de compartilhamento usa o link completo).

## Onde mexer

- **Textos das peças, salas, manifesto e sobre** (inclusive os cabeçalhos de cena, a decupagem do filme e os registros do BID): `src/data/pieces.ts`
- **Contato (WhatsApp, e-mail), música e tempos da abertura:** `src/data/site.ts`
- **Novas imagens:** coloque o original em `media-src/img/` e rode `npm run media`. O script gera AVIF, WebP e JPG em três tamanhos e atualiza `src/data/media-manifest.json`.
- **Novo filme:** `npm run video media-src/video/arquivo.mp4 15.6` (gera WebM, MP4 e o pôster no segundo indicado; precisa de ffmpeg).
- **Escudo da title screen:** `python3 scripts/cut-crest.py` recorta o escudo oficial (`media-src/crest/logo-abigos-principal.jpg`) sem o círculo verde.

## Técnica

React + Vite + TypeScript · GSAP (ScrollTrigger) · Lenis · three.js / React Three Fiber · Web Audio API · WebGL puro na title screen · componentes do [21st.dev](https://21st.dev) como base (galeria com cartões girando).
