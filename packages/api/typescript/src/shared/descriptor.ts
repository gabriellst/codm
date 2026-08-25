// src/shared/descriptor.ts — o que um bounded context DECLARA sobre si, sem montar nada.
//
// ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
// │ POR QUE ISTO EXISTE                                                                          │
// │                                                                                              │
// │ Até 2026-08-14 cada `<ctx>/index.ts` chamava `await BoundedContext.create({…})` NO TOPO DO    │
// │ MÓDULO e exportava `ctx.router`. Montar era um EFEITO COLATERAL DE IMPORT: `routers.ts`       │
// │ importava os dez, e importar `routers.ts` — para qualquer fim, inclusive só listar rotas —    │
// │ registrava dez containers filhos, dez conjuntos de handlers e os jobs de três contextos.     │
// │                                                                                              │
// │ A consequência medida: a composição não era fatiável. Tirar um contexto do `ROUTERS`         │
// │ quebrava o `satisfies Record<ContextId, Router>`; deixá-lo mantinha o efeito colateral.   │
// │ "Não montado" e "não carregado" eram coisas diferentes, e é por isso que existia um FILTRO    │
// │ (`filterRoutersForCloudProfile`) em vez de uma composição: o perfil da nuvem montava os dez e │
// │ depois escondia sete.                                                                        │
// └──────────────────────────────────────────────────────────────────────────────────────────────┘
//
// Um descritor é DADO. Importá-lo não abre recurso, não registra binding e não agenda job — o
// `manifest.ts` pode listar os dez sem montar nenhum, e o laço de composição (`server.ts`) monta
// exatamente os que a tabela de alocação disser, sob os critérios do processo.
//
// FORMA: deriva de `BoundedContextOptions` DO CODM, nunca de uma lista literal de campos. O tipo do
// kernel daqui tem 12 campos e NÃO tem `start`/`shutdown` (o do template tem 13 e tem); redigitar a
// lista aqui criaria a segunda cópia que o `tsc` deixaria envelhecer em silêncio.
import type { BoundedContextOptions } from '@codm/core-typescript'
import type { ContextId } from '@codm/contracts/context-ids'
import type { InfraModules } from './deployment'

/**
 * O que um contexto declara para ser montado.
 *
 * `infra` é o mapa eixo→família→bindings deste contexto — o outro lado da amarra da tabela de
 * alocação: a tabela diz QUAL família o contexto usa sob dados critérios, e isto diz QUAIS bindings
 * cada família traz. É `Partial` porque um contexto pode não declarar eixo nenhum (`external`), e a
 * amarra bidirecional é o que torna as duas metades verificáveis uma contra a outra:
 *
 *   eixo declarado aqui sem escolha na tabela  → o contexto traz bindings que ninguém pediu
 *   escolha na tabela sem eixo declarado aqui  → a composição não tem o que resolver
 *
 * Ambas lançam no boot (`server.ts`), nunca caem em default silencioso.
 */
export interface ContextDescriptor extends BoundedContextOptions<ContextId> {
	readonly infra?: Partial<InfraModules>
}
