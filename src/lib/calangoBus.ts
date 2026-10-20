// Canal entre as seções (DOM) e o palco 3D.
// As seções marcam âncoras com data-calango="..." e escrevem aqui o estado da transformação.
export const calangoBus = {
  /** 0..1: o calango ASCII vira 3D (de cima para baixo), durante a saída do hero */
  reveal: 0,
  /** 0..1: o calango se "imprime" de volta no patch da camisa Casa */
  vanish: 0,
  /** 0..1: quanto o calango de fato já se imprimiu no patch (escrito pelo palco 3D) */
  landed: 0,
  /** velocidade do scroll (px/frame), para o calango andar mais rápido quando a página corre */
  velocity: 0,
  /** contador: cada incremento pede ao calango uma exibição territorial (flexões), se ele estiver livre */
  cue: 0,
};
