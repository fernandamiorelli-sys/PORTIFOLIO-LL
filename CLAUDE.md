# Notas para o Claude

## Vídeo e som

- **Vídeo em HTML:** skills `hyperframes`, `hyperframes-cli`, `hyperframes-registry` e `media-use`, em `.claude/skills`. A CLI baixa o Chrome sozinha (`npx hyperframes browser ensure`). Se `cdn.jsdelivr.net` estiver bloqueado, baixe o GSAP com `npm pack gsap` e carregue o `gsap.min.js` local no `index.html`.
- **Efeitos no quadro certo:** skill `real-sfx`, já configurada (`config.json`) com os 19 sons da `media-use` (Pixabay, uso comercial livre) como biblioteca principal, mais 78 sons de interface CC0. Rode os scripts de dentro de `.claude/skills/real-sfx` e use pastas de trabalho e de resultado fora do repositório.
- **Som que falta na biblioteca:** skill `earshot`. Antes de usar, rode `bash scripts/setup-earshot.sh` (modo leve, cerca de 40 s por sessão) e chame o executável que ele imprime com `EARSHOT_OFFLINE=1`. Funcionam `sfx`, `kit` e `measure`; a escuta com IA (`describe`, `match`, `find`, `critique`) depende do PyTorch e de modelos do Hugging Face, bloqueados nesta nuvem.
- **Busca de sons:** a `media-use` procura no Openverse (`api.openverse.org`); se a rede bloquear, usa os sons offline. Anote título, autor e licença de cada som usado.
