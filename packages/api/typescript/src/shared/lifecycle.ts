import type { DependencyContainer } from 'tsyringe-neo'
import { ExternalMediator, InternalMediator, OutboxDispatcher, resolve } from '@codm/core-typescript'

/**
 * O CICLO DE VIDA DO KERNEL — os pumps que todo deployment liga, e a devolução deles.
 *
 * ── o `setup` foi APAGADO, e a deleção é o registro de duas correções ────────────────────────────
 * Ele carregava duas coisas, e as duas saíram por razões diferentes:
 *
 *   1. **o registro de enums e schemas** — agregava quatro contextos, e isso nunca foi assunto do
 *      `shared`. Foi para `src/openapi.ts`, que é raiz de composição (DC2). O rail de fronteira de
 *      contexto foi quem apontou, acusando dois imports cross-context que só passavam por uma
 *      isenção concedida ao arquivo antigo.
 *
 *   2. **o pin do driver** — um `registerInstance` do `DatabaseDriver` no container raiz, cujo
 *      próprio comentário explicava a causa: *"`BoundedContext.create` aplica o registry de cada
 *      contexto no container RAIZ, e re-registrar um token singleton descarta a instância em cache"*.
 *      Sem o pin, um consumidor que resolvia cedo e outro que resolvia tarde ficavam com drivers
 *      DIFERENTES sobre o mesmo arquivo, cada um com seu portão FIFO — e dois "serializados"
 *      disputavam o lock do SQLite. Foi o que deixou o `mailboxDispatcher` reportando `down` para
 *      sempre.
 *
 * O pin era o SINTOMA tratado; a composição em duas fases (ADR 0007) trata a causa. Com todos os
 * bindings ligados antes de qualquer resolução, nada re-registra depois, e não há cache para
 * descartar. Um workaround que some porque a causa morreu é a melhor forma de fechar um bug —
 * melhor que um guard que alguém precisa lembrar de manter.
 *
 * O que sobra aqui é o que sempre foi genuinamente do kernel: ligar e devolver os pumps.
 */

/**
 * O transporte externo sobe ANTES do despachante de outbox, e a ordem não é estética: o dispatcher
 * publica no mediador externo, e ligá-lo primeiro abriria uma janela em que ele tem o que entregar
 * e ninguém para receber.
 */
export const start = async (container: DependencyContainer): Promise<void> => {
	const externalMediator = resolve(container, ExternalMediator)
	const outboxDispatcher = resolve(container, OutboxDispatcher)

	await externalMediator.start()
	outboxDispatcher.start()
}

/**
 * Inverso da aquisição: primeiro cala quem PRODUZ (o dispatcher), depois derruba as assinaturas, e
 * só então o transporte. Derrubar o transporte com o dispatcher ainda girando produziria falha de
 * entrega num encerramento que era para ser limpo.
 *
 * O pool de banco não se fecha aqui — é de processo, é o último passo, e é da raiz.
 */
export const shutdown = async (container: DependencyContainer): Promise<void> => {
	await resolve(container, OutboxDispatcher).stop()

	resolve(container, InternalMediator).removeAllListeners()
	resolve(container, ExternalMediator).removeAllListeners()

	await resolve(container, ExternalMediator).stop()
}
