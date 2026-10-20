# Tudo o que não somos

Exposição digital da direção de arte de **Lucas Lopes** para o **Abigos FR**: a campanha Sangue-Frio, os reforços, os confrontos e a identidade do clube, criados com IA no Higgsfield.

> *Everything I'm not made me everything I am.*

## A experiência, em atos

| Ato | O que acontece | Referência |
| --- | --- | --- |
| Boot | A tela abre desfocada e entra em foco em 1 s | — |
| Title screen | Dados do projeto correndo atrás de um vidro arranhado; o escudo e o título "impressos" no vidro; a luz segue o mouse e revela os riscos | Title screen de Cyberpunk 2077 |
| Hacking | A música entra em fade no 0:09 e estabiliza no 0:14; nesses 5 s o acervo é "descriptografado" e o calango minimalista se forma em caracteres | Buralqy |
| O idealizador | A foto do Lucas encolhe para uma moldura de museu, vira P&B e recebe a assinatura; na saída, o calango de código vira o calango 3D em chrome glass | landonorris.com |
| Manifesto | O calango 3D atrás, o título se reembaralhando entre o que o time *não* é, com flashes do acervo | kinoria.studio |
| Sala 01 · Sangue-Frio | As peças entram pela lateral enquanto o céu passa por um dia inteiro no sertão (amanhecer → madrugada) | landonorris.com |
| Salas 02–04 | Reforços, Confrontos (com placar split-flap) e Identidade, onde o calango volta para casa: o patch da camisa | — |
| Fechamento | A frase se completa: "…nos fez tudo o que somos." e o botão **Vamos trabalhar juntos** | — |

Cada peça abre uma **ficha da obra** com o processo criativo e a ficha técnica. Em *Epiderme* e *Rural* há uma lupa para inspecionar a imperfeição; em *Gume*, um comparador entre o escudo original e o novo.

## Rodar no computador

```bash
npm install
npm run dev
```

Abra o endereço que aparecer no terminal (geralmente `http://localhost:5173`).

## Publicar na Vercel

1. Entre em [vercel.com](https://vercel.com) com sua conta do GitHub.
2. **Add New → Project** e importe este repositório.
3. A Vercel detecta Vite sozinha (`npm run build`, pasta `dist`). Clique em **Deploy**.
4. Em **Settings → Domains**, troque o endereço para algo como `tudoquenaosomos.vercel.app` ou conecte um domínio próprio.

A cada atualização no GitHub, a Vercel publica de novo automaticamente.

## Arquivos que faltam (e onde entram)

O site já funciona sem eles: as peças pendentes ficam escondidas até o arquivo chegar.

| Arquivo | Onde colocar | Depois |
| --- | --- | --- |
| Filme *Alvi-Verde* (SANGUE-FRIO vídeo) | `public/media/video/alvi-verde.mp4` | Em `src/data/pieces.ts`, na peça `alvi-verde`, apague `pending: true` |
| Música (Tame Impala, instrumental) | `public/media/audio/new-person-same-old-mistakes.mp3` | Nada: o site detecta sozinho |
| REFORÇOS leo | `media-src/img/reforcos-leo.png` e rode `npm run media` | Na peça `telemetria`, apague `pending: true` |
| CONFRONTOS PUCRS | `media-src/img/confrontos-pucrs.png` e rode `npm run media` | Na peça `miragem`, apague `pending: true` |

## Onde mexer

- **Textos das peças, salas, manifesto e sobre:** `src/data/pieces.ts`
- **Contato (WhatsApp, e-mail, Instagram), música e tempos da abertura:** `src/data/site.ts`
- **Novas imagens:** coloque o original em `media-src/img/` e rode `npm run media`. O script gera AVIF, WebP e JPG em três tamanhos e atualiza `src/data/media-manifest.json`.

## Técnica

React + Vite + TypeScript · GSAP (ScrollTrigger, ScrambleText) · Lenis · three.js / React Three Fiber · Web Audio API · WebGL puro na title screen · componentes do [21st.dev](https://21st.dev) como base (galeria com cartões girando, placar split-flap).

Fontes: Anybody (largura variável), Bodoni Moda e Martian Mono, todas SIL Open Font License. A assinatura usa Mrs Saint Delafield (OFL).
