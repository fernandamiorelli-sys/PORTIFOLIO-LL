// Acervo da exposição. Textos de processo em primeira pessoa (statement do diretor),
// fichas técnicas curtas, e a ordem curatorial de cada sala.

export type RoomId = 'sangue-frio' | 'reforcos' | 'confrontos' | 'identidade';

export type DayPhase = 'amanhecer' | 'meio-dia' | 'tarde' | 'crepusculo' | 'noite' | 'estudio';

export interface Match {
  date?: string;
  day?: string;
  time?: string;
  versus: string;
  place?: string;
}

export interface Piece {
  id: string;
  n: string;
  title: string;
  room: RoomId;
  /** slug da imagem em media-manifest.json (pôster, no caso de vídeo) */
  media: string;
  /** filme: `base` sem extensão; o site serve base.webm e base.mp4 (gerados por `npm run video`) */
  video?: { base: string; pending?: boolean };
  alt: string;
  lead: string;
  ficha: string[];
  process: string[];
  /** hora solar exibida no relógio da sala Sangue-Frio */
  clock?: { time: string; phase: DayPhase };
  loupe?: boolean;
  compare?: { before: string; after: string; labels: [string, string] };
  match?: Match;
  /** imagem ainda não enviada: a peça fica fora da exposição até chegar */
  pending?: boolean;
}

export interface Room {
  id: RoomId;
  n: string;
  title: string;
  kicker: string;
  intro: string[];
  data?: [string, string][];
}

export const ROOMS: Room[] = [
  {
    id: 'sangue-frio',
    n: '01',
    title: 'Sangue-Frio',
    kicker: 'Campanha da camisa II · visitante · 2026',
    intro: [
      'Para apresentar a nova camisa visitante do Abigos FR, fui atrás do que o nosso mascote significa de verdade. O calango é filho do sertão: da caatinga cinzenta, da pedra quente sob o sol do meio-dia. Num bioma em que quase tudo é poeira e galho seco, só dois verdes resistem — o do juazeiro e o do calango. A campanha transforma esse sertão em estética e em símbolo.',
      'O nome vem da biologia e do futebol ao mesmo tempo. O calango é um réptil de sangue frio; e sangue-frio é o que separa, dentro de campo, quem decide de quem hesita. Para acompanhar a camisa, o escudo também mudou: um desenho mais afiado, à altura do tema.',
    ],
    data: [
      ['Peças', '1 filme · 10 imagens'],
      ['Direção de arte', 'Lucas Lopes'],
      ['Geração', 'Higgsfield'],
      ['Curadoria', 'um dia no sertão, do primeiro sol à madrugada'],
    ],
  },
  {
    id: 'reforcos',
    n: '02',
    title: 'Reforços',
    kicker: 'Anúncios de novos jogadores',
    intro: [
      'Anunciar um reforço é apresentar um personagem ao torcedor. Cada chegada pediu uma linguagem própria — e nenhuma delas é a linguagem padrão de um clube amador.',
    ],
  },
  {
    id: 'confrontos',
    n: '03',
    title: 'Confrontos',
    kicker: 'Anúncios de partidas',
    intro: [
      'Todo jogo é um evento. Três confrontos, três linguagens gráficas: do brutalismo ao surrealismo, passando pelo minimalismo.',
    ],
  },
  {
    id: 'identidade',
    n: '04',
    title: 'Identidade',
    kicker: 'A camisa Casa',
    intro: [
      'Antes da campanha e antes do escudo novo, existe a casa. A primeira camisa do Abigos — preta, com o calango no peito — é onde tudo começou.',
    ],
  },
];

export const PIECES: Piece[] = [
  // ───────────────────────────── SALA 01 · SANGUE-FRIO
  {
    id: 'alvi-verde',
    n: '01',
    title: 'Alvi-Verde',
    room: 'sangue-frio',
    media: 'alvi-verde-poster',
    video: { base: '/media/video/alvi-verde' },
    alt: 'Filme da campanha Sangue-Frio: a camisa alvi-verde do Abigos FR vista em primeira pessoa, do corte do tecido à prensa.',
    lead: 'O processo industrial da camisa, visto pelos olhos dela mesma.',
    ficha: [
      'Filme · POV de objeto',
      'Montagem rítmica, cortes secos',
      'Trilha: “Inner Light”, Bob Moses & Elderbrook',
      'Referência: o “Olhar Estendido” de GTA VI',
      '100% Higgsfield',
    ],
    process: [
      'Este filme me dá uma satisfação especial: foi o primeiro que dirigi inteiramente no Higgsfield.',
      'A camisa é a protagonista — feita sob medida para elevar o patamar do clube, de quem a veste e de quem acredita no projeto. Sob medida, porque o filme acompanha o processo industrial pelo qual ela passa até chegar ao jogador: do corte do tecido à costura, da costura à prensa. Protagonista, porque tudo é visto em POV, pelo ponto de vista da própria camisa.',
      'Na linguagem audiovisual, o POV de um objeto pede dinamismo: montagem rítmica, acelerada, cheia de cortes. A inspiração veio do “Olhar Estendido” de GTA VI; a trilha é “Inner Light”, de Bob Moses e Elderbrook.',
      'Foi minha estreia em vídeo, e levou o elenco do clube à euforia. Saí dele orgulhoso — e com mais fome de me aperfeiçoar.',
    ],
  },
  {
    id: 'cordel',
    n: '02',
    title: 'Cordel',
    room: 'sangue-frio',
    media: 'sangue-frio-pendurado',
    alt: 'Camisa listrada em verde e branco do Abigos FR presa por pregadores num varal, em contraluz contra o sol nascente e o céu azul do Nordeste.',
    lead: 'Uma camisa que ainda não entorta o varal.',
    ficha: ['Still de produto em contraluz', 'Céu limpo do Nordeste ao amanhecer', 'Higgsfield'],
    clock: { time: '05:42', phase: 'amanhecer' },
    process: [
      'Como consumidor ativo de futebol, sou fã da expressão “camisa tão pesada que entorta o varal”. Ela pressupõe décadas de história, títulos incontáveis, episódios de glória memorável. Quis trazê-la para a campanha — mas por outro ponto de vista.',
      'O Abigos nasceu em 2026, e isso está no nascer do sol que estoura atrás do tecido, num céu limpo de Nordeste. Nossa glória ainda está por vir; está reservada ao futuro. Por isso a camisa ainda não entorta o varal. Ele só está ali, esperando o momento.',
      'O título guarda dois sentidos: o cordel do varal e o cordel da literatura nordestina, cujos folhetos também se vendem pendurados num barbante.',
    ],
  },
  {
    id: 'tracao',
    n: '03',
    title: 'Tração nas Quatro-Patas',
    room: 'sangue-frio',
    media: 'sangue-frio-resenha',
    alt: 'Jogador do Abigos FR sentado num buggy branco chamado Resenhex 3000, no deserto, estendendo para a câmera uma chave com chaveiro de pele de calango, em grande-angular com flash.',
    lead: 'O flash editorial das revistas de moda, levado para o sol a pino da caatinga.',
    ficha: ['Flash editorial', 'Grande-angular 18 mm', 'Sol do meio-dia', 'Modelo: jogador do elenco', 'Higgsfield'],
    clock: { time: '12:00', phase: 'meio-dia' },
    process: [
      'Assim como a música e o videogame, a fotografia é uma paixão. Passei os últimos meses estudando composição e como a lente escolhida muda completamente o tom de uma imagem. Nessa pesquisa, me apaixonei pelo flash editorial com lente de 18 mm — um enquadramento bem aberto, muito comum em fotos urbanas e descontraídas de revistas de moda.',
      'Quis levar essa técnica para o lado sertanejo. Para traduzir tanta descontração, um dos nossos companheiros de time virou modelo: ele está sentado num buggy batizado de “Resenhex 3000”, segurando uma chave com chaveiro de pele de calango, sob o sol do meio-dia. Uma técnica tão jovial num cenário tão árido — é aí que mora a graça.',
    ],
  },
  {
    id: 'pe-duro',
    n: '04',
    title: 'Pé-Duro',
    room: 'sangue-frio',
    media: 'sangue-frio-cavalo',
    alt: 'Plano detalhe em preto e branco da pelagem escura de um cavalo, com fios claros da crina e o escudo do Abigos FR gravado no pelo.',
    lead: 'O escudo marcado no pelo do animal que tornou o sertão habitável.',
    ficha: ['Plano detalhe em preto e branco', 'Textura de pelagem e crina', 'Higgsfield'],
    clock: { time: '15:20', phase: 'tarde' },
    process: [
      'O cavalo nordestino — o pé-duro, como é chamado — foi o elemento central que tornou possíveis a ocupação e a sobrevivência no sertão. Um personagem de tanta importância para a sociedade sertaneja não poderia passar despercebido na campanha.',
      'Em vez de mostrar o animal inteiro, fechei no pelo: o escudo do Abigos aparece gravado na pelagem, entre os fios da crina, em preto e branco. Identidade marcada em quem carrega o sertão nas costas.',
    ],
  },
  {
    id: 'juazeiro',
    n: '05',
    title: 'Juazeiro',
    room: 'sangue-frio',
    media: 'sangue-frio-posing',
    alt: 'Retrato de Lucas Lopes de chapéu de palha e camisa listrada do Abigos FR, apoiado numa cerca de madeira ao crepúsculo, sob um juazeiro com um calango no galho.',
    lead: 'Um retrato que começou como foto de flash e terminou como fotopintura.',
    ficha: [
      'Retrato em estúdio montado no sertão',
      'Luz dramática, quase teatral',
      'Referência: fotopintura nordestina',
      'Modelo: Lucas Lopes',
      'Higgsfield',
    ],
    clock: { time: '18:06', phase: 'crepusculo' },
    process: [
      'É curioso como o processo criativo pode mudar uma peça quase pronta de um minuto para o outro. Assim como na Tração nas Quatro-Patas, a ideia era retratar um sertanejo em sua pose de superioridade despojada, com o mesmo flash editorial a 18 mm. E estava indo bem: o flash criaria um alto contraste com a luz fraca do crepúsculo ao fundo.',
      'Até que, em meio a incontáveis horas de pesquisa, descobri que a fotopintura foi um movimento fortíssimo no Nordeste, presente em inúmeras salas de estar sertanejas. Decidi que a imagem seria feita como num estúdio perfeitamente montado — quase uma tela verde atrás do homem —, com luz dramática e teatral, para que o resultado emulasse uma pintura. Por que não? A pintura ganhou espaço na campanha.',
      'O modelo da imagem, aliás, sou eu.',
    ],
  },
  {
    id: 'insonia',
    n: '06',
    title: 'Insônia',
    room: 'sangue-frio',
    media: 'sangue-frio-noite',
    alt: 'Homem de camisa listrada do Abigos FR num campo escuro à noite, rosto borrado pelo movimento e iluminado por flash, com céu azul profundo e silhueta de montanha ao fundo.',
    lead: 'Motion blur e flash numa noite de deserto: o rosto se desfaz, a camisa permanece.',
    ficha: ['Flash direto + obturador lento', 'Motion blur em retrato', 'Alto contraste noturno', 'Higgsfield'],
    clock: { time: '23:47', phase: 'noite' },
    process: [
      'Uma das minhas primeiras tentativas de aplicar motion blur em pessoas — efeito que eu viria a dominar ao longo deste portfólio.',
      'Ela nasceu depois de algumas rodadas de brainstorm no Pinterest, estudando justaposições de flash em ambientes desérticos e escuros. O resultado é uma imagem de alto contraste de que gosto muito: o rosto se desfaz em movimento enquanto a camisa continua nítida, cravada na noite.',
    ],
  },
  {
    id: 'epiderme',
    n: '07',
    title: 'Epiderme',
    room: 'sangue-frio',
    media: 'sangue-frio-close',
    alt: 'Macro das escamas de um calango em degradê de verde-turquesa, oliva e creme, com pequenos grãos de terra entre elas.',
    lead: 'Escamas, grãos de terra, imperfeição. Use a lupa.',
    ficha: ['Macro em plano detalhe', 'Textura orgânica', 'Direção rumo à imperfeição', 'Higgsfield'],
    clock: { time: '02:13', phase: 'estudio' },
    loupe: true,
    process: [
      'Uma das minhas imagens favoritas de toda a campanha. Como apaixonado por fotografia, sei que enquadramentos em macro revelam sutilezas que fazem toda a diferença no simbolismo de uma imagem. E os detalhes revelam imperfeições.',
      'Para mim, é simplesmente perfeito o quanto esta imagem é imperfeita — e ela saiu exatamente como a concebi na cabeça. As escamas têm tamanhos e formas diferentes; entre elas há grãos, pequenas sujeiras de terra, minúcias que tornam esta peça, dirigida por mim no Higgsfield, indistinguível de uma fotografia real.',
    ],
  },
  {
    id: 'rural',
    n: '08',
    title: 'Rural',
    room: 'sangue-frio',
    media: 'sangue-frio-tecido',
    alt: 'Macro da gola verde e branca da camisa do Abigos FR, com areia sobre o tecido, pontas de costura soltas e fios saltados, sob luz lateral.',
    lead: 'A gola inacabada, com areia e fios soltos: o avesso do perfeito.',
    ficha: ['Macro de tecido', 'Luz lateral rasante', 'Gola inacabada, fios soltos e areia', 'Higgsfield'],
    clock: { time: '03:05', phase: 'estudio' },
    loupe: true,
    process: [
      'Mais um exemplo de como o simples bem-feito tem um impacto visual poderoso e autoritário. Um plano detalhe da gola inacabada da nossa camisa, com detalhes tão microscópicos que fazem qualquer um sentir o tecido do outro lado da tela.',
      'A sujeira de areia, as pontas soltas de costura e os fios saltados fazem desta imagem um colosso gerado por IA, do qual me orgulho imensamente. Num mundo em que a IA tenta gerar o perfeito a partir de prompts superficiais, a direção consciente no sentido oposto — em busca da imperfeição — é o que torna uma peça como esta crível.',
    ],
  },
  {
    id: 'bioma',
    n: '09',
    title: 'Bioma',
    room: 'sangue-frio',
    media: 'sangue-frio-dobrado',
    alt: 'Camisa listrada do Abigos FR dobrada sobre mesa de madeira rústica, ao lado de um bowl de terracota, um mandacaru, uma garrafa de vidro verde-escuro e uma taça de cristal, em fundo preto.',
    lead: 'A crueza da caatinga encontra a sofisticação da fotografia de estúdio.',
    ficha: [
      'Still life em chiaroscuro',
      'Madeira rústica, terracota, vidro, mandacaru',
      'Harmonia cromática em verde',
      'Higgsfield',
    ],
    clock: { time: '04:30', phase: 'estudio' },
    process: [
      'Meu ponto de partida foi traduzir a essência do Abigos FR e o conceito do calango sertanejo numa narrativa visual que unisse a crueza da caatinga à sofisticação da fotografia de estúdio.',
      'A mesa de madeira rústica e o bowl de terracota ancoram a cena em texturas orgânicas e terrosas. O mandacaru e a garrafa de vidro verde-escuro foram posicionados estrategicamente para criar uma harmonia cromática que ecoa e amplifica o verde vibrante do manto.',
    ],
  },
  {
    id: 'trademark',
    n: '10',
    title: 'Trademark',
    room: 'sangue-frio',
    media: 'sangue-frio-brand',
    alt: 'Padrão de calangos minimalistas brancos repetidos em diagonal sobre fundo verde-mata.',
    lead: 'Calango. Calango. Calango.',
    ficha: ['Padrão de marca', 'Repetição do mascote minimalista', 'Verde-mata e osso'],
    clock: { time: '04:58', phase: 'estudio' },
    process: ['Calango. Calango. Calango.'],
  },
  {
    id: 'gume',
    n: '11',
    title: 'Gume',
    room: 'sangue-frio',
    media: 'sangue-frio-novo-escudo',
    alt: 'Novo escudo do Abigos FR: calango verde em traço chapado abraçando uma bola, sobre listras verdes e pretas, com o nome do clube, três estrelas e o ano 2026.',
    lead: 'O escudo redesenhado para a campanha: mais afiado, mais imponente.',
    ficha: ['Redesign de escudo', 'Vetor, traço chapado', 'Preto profundo e verde Abigos', '2026'],
    clock: { time: '05:30', phase: 'estudio' },
    compare: { before: 'escudo-oficial', after: 'sangue-frio-novo-escudo', labels: ['Escudo original', 'Escudo Sangue-Frio'] },
    process: [
      'Para a camisa visitante, o escudo também precisava mudar. O desenho original, mais ilustrativo, deu lugar a um traço chapado, de contornos limpos e ângulos mais duros: o calango redesenhado em forma gráfica, abraçando a bola, sobre listras verticais e preto profundo.',
      'A ideia foi deixá-lo mais afiado e imponente — à altura do sangue-frio que a campanha pede. Arraste a linha sobre a imagem para comparar o antes e o depois.',
    ],
  },

  // ───────────────────────────── SALA 02 · REFORÇOS
  {
    id: 'telemetria',
    n: '12',
    title: 'Telemetria',
    room: 'reforcos',
    media: 'reforcos-leo',
    alt: 'Anúncio do reforço Leo Gluher, 21 anos: de óculos escuros e agasalho, ele atravessa o quadro em disparada, desfeito em motion blur sobre um azul elétrico; caixas de rastreamento com coordenadas e trajetórias tracejadas marcam o corpo, uma delas enquadrando o calango no peito. No topo, “Bem-vindo, Leo Gluher, 21”; no canto, o escudo do Abigos em branco.',
    lead: 'Velocidade, rastreamento e um azul elétrico: o atleta lido como dado.',
    ficha: [
      'Paleta Gen X Soft Club, no seu lado azulado',
      'Motion blur de fotografia esportiva',
      'Data overlay: caixas de rastreamento, coordenadas, trajetórias',
      'Higgsfield',
    ],
    process: [
      'Para anunciar o Leo, juntei três coisas que me fascinam. A primeira é a paleta da Gen X Soft Club, aqui no seu lado mais azulado: um azul elétrico, quase monocromático, com a nostalgia do começo dos anos 2000.',
      'A segunda é o motion blur da fotografia esportiva, que transforma velocidade em imagem. O Leo atravessa o quadro em disparada; só o perfil e os óculos escuros continuam nítidos, e o resto se desfaz em rastros de luz.',
      'A terceira é o data overlay como elemento gráfico. Caixas de rastreamento, coordenadas e trajetórias tracejadas leem o corpo do atleta como uma máquina leria — e, no peito, a caixa que enquadra o calango registra o único dado que importa: CLUB: ABIGOS FR.',
      'O resultado é um anúncio que parece capturado no meio de um lance e processado por um computador ao mesmo tempo. Bem-vindo, Leo.',
    ],
  },
  {
    id: 'bagagem',
    n: '13',
    title: 'Bagagem',
    room: 'reforcos',
    media: 'reforcos-filipe',
    alt: 'Anúncio do reforço Filipe Freitas: jogador de costas com a camisa preta 13, puxando uma mala coberta de adesivos de clubes e bandeiras, entrando num estádio sob fogos de artifício.',
    lead: 'A linguagem da 433: estádio, fogos e uma mala cheia de história.',
    ficha: [
      'Montagem no estilo 433',
      'Estádio, fogos, jogador de costas',
      'A mala de adesivos como narrativa',
      'Higgsfield',
    ],
    process: [
      'O anúncio do Filipe fala a língua da 433, uma das contas de futebol mais conhecidas do mundo: montagem épica, estádio iluminado, fogos de artifício e o jogador de costas, caminhando para dentro de campo.',
      'O detalhe que conta a história é a mala. Coberta de adesivos — clubes, bandeiras, lugares —, ela resume a bagagem que o novo camisa 13 traz consigo. Freitas chega com tudo à mostra.',
    ],
  },

  // ───────────────────────────── SALA 03 · CONFRONTOS
  {
    id: 'reticula',
    n: '14',
    title: 'Retícula',
    room: 'confrontos',
    media: 'confrontos-amistoso',
    alt: 'Pôster do amistoso Abigos FR contra Diretoria FC: a palavra AMISTOSO em verde ultra-condensado sobre fundo preto e foto em preto e branco com halftone de dois jogadores.',
    lead: 'Brutalismo gráfico e halftone: um amistoso com peso de final.',
    ficha: ['Arte gráfica brutalista', 'Halftone sobre foto P&B', 'Tipografia ultra-condensada', 'Monocromia em verde'],
    match: { date: '24/05', day: 'DOMINGO', time: '16H', versus: 'DIRETORIA FC', place: 'PLANETBALL' },
    process: [
      'Para o amistoso contra o Diretoria FC, apostei na arte gráfica brutalista aliada ao halftone. A tipografia ultra-condensada ocupa o pôster de ponta a ponta; a foto em preto e branco ganha retícula granulada; e um único verde amarra tudo.',
      'É a linguagem dos pôsteres de grandes clássicos aplicada a um amistoso de futebol society — tratar o jogo dos amigos com o peso de uma final.',
    ],
  },
  {
    id: 'preparamento',
    n: '15',
    title: 'Preparamento',
    room: 'confrontos',
    media: 'confrontos-treino',
    alt: 'Pôster do jogo-treino: um camaleão verde em halftone, de camisa havaiana, sobre papel cru, com a data 06/07 em contorno e JOGO-TREINO em letras pretas pesadas.',
    lead: 'O mesmo halftone, agora em chave minimalista — e com humor.',
    ficha: ['Halftone minimalista', 'Papel cru, data em contorno', 'Composição suíça', 'Higgsfield'],
    match: { date: '06/07', time: '23H', versus: 'JOGO-TREINO', place: 'PLANETBALL' },
    process: [
      'O jogo-treino também usa halftone, mas numa pegada minimalista: papel cru, muito respiro, a data desenhada só em contorno e a tipografia pesada ancorando a base.',
      'No centro, um camaleão de camisa havaiana encara o espectador, impassível — um aceno ao faroeste de Rango. A legenda completa a piada: “Um preparamento para o futuro.”',
    ],
  },
  {
    id: 'proxima-estacao',
    n: '16',
    title: 'Próxima Estação',
    room: 'confrontos',
    media: 'confrontos-pucrs',
    alt: 'Pôster do confronto Abigos FR x PUCRS Fussball: num vagão de metrô com letreiro de LED laranja “PUCRS →”, um passageiro com cabeça de calango, boné verde e jaqueta puffer preta senta-se impassível, fone com fio no ouvido e a cauda largada no banco laranja, entre torcedores que gargalham com cachecóis verdes e brancos. Embaixo: “Próxima estação.”, 12/10, 16h.',
    lead: 'Surrealismo de vagão: um calango a caminho do jogo, no flash da Gen X Soft Club.',
    ficha: ['Surrealismo cotidiano', 'Flash direto, grão de câmera descartável', 'Paleta Gen X Soft Club', 'Higgsfield'],
    match: { date: '12/10', time: '16H', versus: 'PUCRS FUSSBALL' },
    process: [
      'Para o confronto contra a PUCRS Fussball, apostei no surrealismo. A cena é banal: um vagão de metrô, o banco laranja, o letreiro de LED anunciando “PUCRS →”, torcedores de cachecol alvi-verde gargalhando no flash.',
      'O absurdo está no passageiro do meio. Um homem com cabeça de calango — boné verde, jaqueta puffer, fone com fio, a cauda largada no banco — segue viagem impassível, como se nada estivesse fora do lugar. O surreal funciona melhor quando ninguém na cena parece notá-lo.',
      'A paleta e a sensação vêm da Gen X Soft Club: o verde lavado da luz fluorescente, o aço do vagão e o grão de câmera descartável do começo dos anos 2000. A frase fecha a ideia: “Próxima estação.” O jogo é o destino; o caminho até ele já é a resenha.',
    ],
  },

  // ───────────────────────────── SALA 04 · IDENTIDADE
  {
    id: 'essencial',
    n: '17',
    title: 'Essencial',
    room: 'identidade',
    media: 'identidade-mascote',
    alt: 'Patch do calango minimalista em verde-limão aplicado sobre tecido preto.',
    lead: 'O calango reduzido ao essencial, no peito da camisa Casa.',
    ficha: ['Design de mascote minimalista', 'Aplicação em patch', 'Camisa Casa · I'],
    process: [
      'O calango em design minimalista: corpo, quatro patas e a cauda em curva — o mascote reduzido ao essencial, sem perder a personalidade. É esse o desenho que vive na primeira camisa do Abigos, a camisa Casa, aplicado como patch sobre o tecido preto.',
      'É também o calango que te acompanhou até aqui.',
    ],
  },
  {
    id: 'acervo',
    n: '18',
    title: 'Acervo',
    room: 'identidade',
    media: 'identidade-vidro',
    alt: 'A camisa preta do Abigos FR, com gola verde-limão e o patch do calango no peito, exposta num manequim dentro de uma vitrine de vidro de museu, sob luz de spot.',
    lead: 'A camisa Casa exposta como peça de museu.',
    ficha: ['Imagem ultrarrealista', 'Vitrine de museu, luz de spot', 'Camisa Casa · I', 'Higgsfield'],
    process: [
      'Uma imagem ultrarrealista da primeira camisa do Abigos, protegida por uma caixa de vidro, em exposição de museu.',
      'Ela resume a intenção deste portfólio inteiro: tratar a história de um time de amigos com o peso de um acervo.',
    ],
  },
];

export const MANIFESTO = {
  phrases: [
    'Não somos os melhores de Porto Alegre.',
    'Não jogamos o futebol mais bonito.',
    'Não temos décadas de história.',
    'Não temos sala de troféus.',
    'Somos amigos desde a sétima série.',
  ],
  about: [
    'O Abigos FR é um time amador de futebol society de Porto Alegre, fundado em 2026 por amigos que andam juntos desde a sétima série.',
    'A gente não sai por aí dizendo que é o melhor da cidade, nem que joga o futebol mais bonito. O que a gente tem é outra coisa: amizade, companheirismo, união.',
    'O time sempre existiu no coração desses amigos. A identidade, o escudo e toda a direção criativa nasceram das mãos de Lucas Lopes.',
  ],
};

export const ABOUT = {
  paragraphs: [
    'Lucas Lopes tem 21 anos. Nasceu em Manaus, no Amazonas, e vive em Porto Alegre há dez anos. Tinha 9 quando se apaixonou por publicidade pela primeira vez — hoje, cursa Publicidade e Propaganda na PUCRS.',
    'É obcecado por processo criativo. Desde muito pequeno, cria nas mais diferentes mídias. Enxerga a inteligência artificial como uma ferramenta de potencial extremo para o audiovisual publicitário e persegue um objetivo claro: criar peças tão bem dirigidas que ninguém consiga dizer que foram feitas por IA.',
    'Seu repertório vem de filmes, séries, videogames, músicas e livros. É na mistura dessas referências — e em ressignificá-las num novo contexto — que ele acredita estar o que torna suas criações especiais.',
    'Acompanha de perto a publicidade feita com IA no Brasil e tem certeza de que dá para ir muito mais longe. Mesmo com o trabalho elogiado por quem o conhece, ainda se considera um aprendiz faminto. Quer entrar numa agência, chegar à direção criativa e, um dia, abrir a própria — movida a Higgsfield.',
  ],
  facts: [
    ['Idade', '21 anos'],
    ['Origem', 'Manaus, AM'],
    ['Base', 'Porto Alegre, RS · há 10 anos'],
    ['Formação', 'Publicidade e Propaganda · PUCRS'],
    ['Publicidade', 'desde os 9 anos'],
    ['Ferramenta', 'Higgsfield'],
    ['Objetivo', 'direção criativa'],
  ] as [string, string][],
  repertoire: [
    'Cyberpunk 2077',
    'GTA VI',
    'Kanye West — Everything I Am',
    'Tame Impala',
    'Bob Moses & Elderbrook',
    '433',
    'Fotopintura nordestina',
    'Flash editorial 18 mm',
    'Gen X Soft Club',
    'Design suíço',
    'Estética chrome',
  ],
};
