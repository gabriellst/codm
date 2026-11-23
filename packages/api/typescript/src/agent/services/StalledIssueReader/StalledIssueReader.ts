import type { ProviderKind } from '@codm/contracts-typescript/wire/enums'

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
	/** What a reminder steer needs to address the issue the way every other steer does. */
	key: string
	title: string
	provider: ProviderKind
	/**
	 * The last item a turn of this issue CONSUMED — the turn that ended without declaring anything — or
	 * `null` when no turn ever ran (an issue declared open with no work queued). Roots the nudge episode
	 * when that turn was not itself a nudge.
	 */
	lastConsumedItemId: string | null
	/**
	 * When that last turn WAS a nudge (`claim_class = REMINDER`, fase 5): which one, and the episode it belongs to —
	 * read off the item's `NudgePayloadSchema`. A reminder migrated by 0038 carries no `rootItemId`: its own id stands
	 * in. Absent when the last turn was anybody's work — then the sweep starts an episode with nudge 1.
	 */
	lastNudge?: { ordinal: number; rootItemId: string }
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
 *  1. **Nenhum item de mailbox em voo** — um item não consumido, não envenenado, E com lease vivo (ou
 *     ainda sem lease nenhum, que é o turno enfileirado esperando slot). Um item consumido é um turno
 *     que ACABOU, e é o instante exato em que a issue vira órfã se ninguém declarou nada.
 *
 *     **A cláusula do lease foi o buraco.** O predicado original parava em `consumed_at IS NULL AND
 *     dead_at IS NULL`, e essas duas colunas de um item reclamado por um worker que morreu ficam NULL
 *     PARA SEMPRE — ninguém as escreve a não ser o próprio worker. Medido em 27/08: duas issues
 *     invisíveis a esta varredura por mais de meia hora, com o item leased e o lease renovado por um
 *     `setInterval` cujo turno nunca assentou, sem nenhum processo de provedor vivo na máquina. A
 *     varredura rodou sessenta vezes e as duas nunca apareceram. O lease é a única coluna que sabe
 *     dizer se alguém ainda está segurando o item, então é ela que decide o que é "em voo".
 *  2. **Nenhum evento de outbox pendente para a issue** (`processed_at IS NULL`) — fecha a corrida com
 *     o materializador. Sem esta metade, um turno que acabou de declarar `COMPLETED` seria marcado
 *     como parado na janela entre gravar o fato e o outbox despachá-lo.
 *
 * As duas juntas significam "não há nada em voo". Um timeout responderia a mesma pergunta pior: ele
 * chuta quanto tempo um turno pode durar, e um turno legítimo de vinte minutos vira falso positivo.
 * A graça sobre um lease JÁ EXPIRADO não é esse chute e não vira: quem estimou a duração foi o lease,
 * aqui só se espera o tempo de o dispatcher reclamar o item de volta (um poll, ≤2s).
 */
export abstract class StalledIssueReader {
	abstract stalledIssues(): Promise<StalledIssueRef[]>
}
