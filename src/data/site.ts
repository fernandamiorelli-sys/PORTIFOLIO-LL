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

/** WhatsApp: o número com país e DDD, só os dígitos, e a mensagem que já chega escrita na conversa
 *  (quem clica pode editar antes de enviar). O link direto do WhatsApp (wa.me) não expira */
const WHATSAPP = '5551991541559';
const WHATSAPP_HELLO = 'Olá! Vi o portfólio Tudo o que não somos e quero conversar sobre um projeto.';

export const CONTACT = {
  whatsapp: `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(WHATSAPP_HELLO)}`,
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
