import type { DependencyContainer } from 'tsyringe-neo'
import { resolve } from '@codm/core-typescript'
import { AgentRunnerFactory } from './services/AgentRunnerFactory/AgentRunnerFactory'
import { MailboxDispatcher } from './services/MailboxDispatcher'
import { McpUpstreamRegistry } from './services/McpUpstreamRegistry'

/**
 * O CICLO DE VIDA DO CONTEXTO `agent` (T1.5) — o que ele liga, e o que ele devolve.
 *
 * ── o que estas doze linhas apagaram, e por que o apagamento é o ponto ───────────────────────────
 * Elas moravam no `src/server.ts`, dentro de DOIS `if (mounted.includes('agent'))` — um no boot,
 * outro no shutdown. Aquele guard era a raiz de composição sabendo o NOME de um contexto para
 * decidir se mexia nele, e é a forma mais cara de acoplamento que este repo tinha: a composição
 * escolhe quais contextos montam, e depois um `if` reafirmava a mesma decisão com um literal. Duas
 * cópias que só concordavam enquanto ninguém mexesse em nenhuma.
 *
 * Com o ciclo declarado aqui, o guard some por CONSTRUÇÃO, não por disciplina: se `agent` não
 * montou, este arquivo nunca é alcançado, e não há o que pular. O `startAll`/`shutdownAll` do
 * kernel opera sobre os contextos que EXISTEM, e "existir" já é a resposta que o `if` procurava.
 *
 * ── por que arquivo próprio, e não inline no `index.ts` ──────────────────────────────────────────
 * Decisão 7 do plano: ciclo de vida é DECISÃO, não derivável — são closures com container, e elas
 * precisam de um lugar. Um arquivo por contexto, presente só onde o concern existe: sete dos dez
 * contextos não têm nada para ligar, e não ganham arquivo vazio por simetria.
 */

/**
 * O dispatcher da mailbox é o único consumidor de turnos enfileirados (pivô do orquestrador, §7.4).
 * `bind(container)` antes de `start()` porque ele resolve handlers sob demanda.
 */
export const start = (container: DependencyContainer): void => {
	resolve(container, MailboxDispatcher).bind(container).start()
}

/**
 * Ordem INVERSA da aquisição, e ela importa: as execuções de agente param antes do dispatcher que as
 * alimenta, senão o dispatcher entregaria um turno novo para um runtime que já está se desfazendo. O
 * registry MCP derruba DEPOIS do runner e ANTES do dispatcher: nenhuma execução em curso ainda precisa
 * de uma conexão upstream (o runner já parou), e o dispatcher só é parado por último pela mesma razão
 * de sempre — nada de novo é entregue a um runtime que já não tem para onde ir.
 *
 * Sem este passo os servidores STDIO — agora filhos DESTE processo, não mais do CLI do provedor (ver
 * o docblock de `ProcessTree`) — sobreviveriam ao fim do daemon.
 *
 * O pool de banco NÃO se fecha aqui — é recurso de processo, é o último passo, e continua sendo da
 * raiz de composição (ver o contrato de `shutdown` no kernel).
 */
export const shutdown = async (container: DependencyContainer): Promise<void> => {
	await resolve(container, AgentRunnerFactory).shutdown()
	await resolve(container, McpUpstreamRegistry).shutdown()
	await resolve(container, MailboxDispatcher).stop()
}
