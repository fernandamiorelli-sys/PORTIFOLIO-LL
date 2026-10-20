// Configurações gerais da exposição. Tudo que o Lucas pode querer trocar sem mexer em componente fica aqui.

export const SITE = {
  title: 'Tudo o que não somos',
  closing: 'nos fez tudo o que somos.',
  club: 'Abigos FR',
  author: 'Lucas Lopes',
  role: 'Diretor de arte',
  year: 2026,
  version: 'ACERVO v2026.07',
} as const;

export const CONTACT = {
  whatsapp: 'https://w.app/phbaih',
  email: 'trabalhecomlucas07@gmail.com',
  /** Preencha com o link do Instagram do Abigos (ex.: https://instagram.com/abigosfr). Vazio = link oculto. */
  instagram: '',
  instagramLabel: 'Instagram do Abigos',
} as const;

export const AUDIO = {
  /** Instrumental de "New Person, Same Old Mistakes" (Tame Impala). */
  src: '/media/audio/new-person-same-old-mistakes.mp3',
  /** A música entra em fade a partir deste segundo... */
  startAt: 9,
  /** ...e estabiliza aqui, na virada do instrumental. A tela de hacking dura exatamente esse intervalo. */
  dropAt: 14,
  /** Ao chegar ao fim, volta para este ponto (a virada) em vez do silêncio do começo. */
  loopFrom: 14,
  volume: 0.85,
} as const;
