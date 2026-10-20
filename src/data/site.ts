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
} as const;

export const AUDIO = {
  /** Instrumental de "New Person, Same Old Mistakes" (Tame Impala). Sem extensão: o site escolhe .webm (Opus) ou .mp3. */
  src: '/media/audio/new-person-same-old-mistakes',
  /** A música entra em fade a partir deste segundo... */
  startAt: 9,
  /** ...e estabiliza aqui, no bumbo do 0:14 (14,19 s). A tela de hacking dura exatamente esse intervalo. */
  dropAt: 14.19,
  /** Ao chegar ao fim, volta para este ponto (a virada) em vez do silêncio do começo. */
  loopFrom: 14.19,
  volume: 0.85,
} as const;
