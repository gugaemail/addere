// Quanto de uma view o teclado cobre, em pontos. As duas medidas precisam estar
// no mesmo referencial: o topo do teclado vem em coordenadas da tela, e a view
// é medida com `measure` (pageY), que também é da tela — no Android edge-to-edge
// e dentro de um Modal, cuja janela ocupa a tela inteira.
export function keyboardOverlap(viewBottom: number, keyboardTop: number | null): number {
  // null: teclado fechado. 0: o iOS com "Preferir transições cruzadas" informa o
  // teclado com topo 0, e a conta daria a view inteira.
  if (keyboardTop == null || keyboardTop <= 0) return 0
  return Math.max(0, Math.round(viewBottom - keyboardTop))
}
