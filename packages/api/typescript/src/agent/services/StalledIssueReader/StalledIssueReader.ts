/**
 * Uma issue que se diz trabalhando e não tem trabalho nenhum em voo.
 *
 * Carrega só o que o fato precisa (`AgentRunStopRaisedEvent` quer os três ids) — não é uma issue
 * rehidratada, e não deve virar uma: o contexto `agent` lê o estado da issue para decidir se há run,
 * nunca para mexer no ciclo de vida dela, que é do `issue`.
 */
export interface StalledIssueRef {
	issueId: string
	ownerId: string
	threadId: string
}

/**
 * Quais issues estão marcadas como trabalhando SEM nada em voo — o predicado que fecha a classe de
 * falha "a issue mente sobre estar viva".
 *
 * Modelado como read Service (leitura de tabela em estilo BFF, não import de write-model de outro
 * contexto), exatamente como `thread/services/OpenIssuesReader` lê a tabela `issues` a partir do
 * `thread`. A direção é a que o CONTEXT_MAP já declara.
 *
 * ### Por que o predicado tem DUAS metades, e por que nenhuma delas é um timeout
 * O sistema já sabe, com precisão, se existe alguém trabalhando numa issue — o `MailboxDispatcher`
 * mantém lease por alvo com heartbeat, e `claimNext` recusa um alvo com lease vivo. Então:
 *
 *  1. **Nenhum item de mailbox em voo** (`consumed_at IS NULL AND dead_at IS NULL`) — cobre de uma vez
 *     o run em andamento (lease vivo) e o turno enfileirado esperando slot. Um item consumido é um
 *     turno que ACABOU, e é o instante exato em que a issue vira órfã se ninguém declarou nada.
 *  2. **Nenhum evento de outbox pendente para a issue** (`processed_at IS NULL`) — fecha a corrida com
 *     o materializador. Sem esta metade, um turno que acabou de declarar `COMPLETED` seria marcado
 *     como parado na janela entre gravar o fato e o outbox despachá-lo.
 *
 * As duas juntas significam "não há nada em voo". Um timeout responderia a mesma pergunta pior: ele
 * chuta quanto tempo um turno pode durar, e um turno legítimo de vinte minutos vira falso positivo.
 */
export abstract class StalledIssueReader {
	abstract stalledIssues(): Promise<StalledIssueRef[]>
}
