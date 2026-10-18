import type { Prisma } from '@prisma/client'

// Trava da linha do contrato da empresa (planos 014 e 015). Uma ordem de travas
// só para tudo que escreve no contrato, nos termos ou nos documentos de uma
// empresa: a linha do contrato PRIMEIRO, antes de qualquer outra escrita da
// transação. Quem chama relê o estado depois da trava e decide por ele.
//
// Por que o updateMany serializa as escritas da mesma empresa:
// - ele vira `UPDATE … SET "seatGuardVersion" = "seatGuardVersion" + 1 WHERE
//   "companyId" = $1`, e todo UPDATE no Postgres prende a linha que altera até
//   o fim da transação;
// - uma segunda transação da mesma empresa chega no mesmo UPDATE e ESPERA a
//   primeira terminar (commit ou rollback);
// - no READ COMMITTED (o padrão do Postgres e do Neon, e o do Prisma quando a
//   transação não define nível de isolamento), cada comando enxerga o que já
//   estava confirmado quando começa: liberada, a segunda relê e vê o que a
//   primeira gravou (o vendedor criado, o aceite, o rascunho editado);
// - SERIALIZABLE ou REPEATABLE READ seriam piores: a segunda falharia com erro
//   de serialização e precisaria de retry. A garantia vem da fila na linha do
//   contrato, não do snapshot;
// - o jeito clássico (um SELECT … FOR UPDATE) exigiria SQL cru; o UPDATE de um
//   contador faz o mesmo com a API normal. seatGuardVersion existe só para
//   isso (o nome vem do 015, que foi o primeiro a usar a trava).
//
// Por que a ordem é única: o aceite escreve no documento, nos termos e no
// contrato; a edição do aditivo, nos termos e no documento. Duas transações
// que prendem as mesmas linhas em ordens diferentes se esperam uma à outra
// (deadlock, 40P01, que vira 500). Com a linha do contrato sempre primeiro, a
// segunda espera na porta, sem prender nada, e o deadlock não tem como nascer.
//
// Quem usa (e precisa continuar usando): withSeat (seat-guard.ts), pedido e
// decisão de licenças, rascunho do contrato, envio, troca do indicado,
// reenvio, cancelamento do envio, aditivo (salvar e descartar) e o aceite. O
// cancelamento do contrato (contract-cancel.service.ts) já começa por um
// updateMany na própria linha do contrato, com o estado no where, e conta como
// a mesma trava.
//
// Contar, ler o status ou escrever ANTES da trava, ou escrever com `prisma` em
// vez do `tx`, desfaz a garantia, e nenhum teste com mock fica vermelho.

type Db = Prisma.TransactionClient

/**
 * Prende a linha do contrato da empresa até o fim da transação. Devolve se a
 * empresa tem contrato: sem contrato não há linha para prender (implantação,
 * teste, piloto, ou o rascunho ainda não foi salvo).
 */
export async function lockContractRow(tx: Db, companyId: string): Promise<boolean> {
  const { count } = await tx.companyContract.updateMany({
    where: { companyId },
    data: { seatGuardVersion: { increment: 1 } },
  })
  return count > 0
}
