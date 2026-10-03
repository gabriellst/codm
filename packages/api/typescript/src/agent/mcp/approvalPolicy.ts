// packages/api/typescript/src/agent/mcp/approvalPolicy.ts — arquivo final COMPLETO
import { McpApprovalPolicy } from '@codm/contracts-typescript/wire/enums'

/**
 * O ÚNICO lugar do código que decide entre gatear e executar uma ferramenta externa.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * SÃO DUAS DECISÕES DE DONOS DIFERENTES, e é por isso que a resolução é uma função e não um `if` no
 * chamador. `McpApprovalPolicy` é a opinião sobre UM servidor ("este MCP de docs é read-only, pode
 * AUTO"). `StopPolicy.approvalNeeded` — a linha de settings por dono que `thread` já mantém e que a
 * tela já renderiza como `stopCriteria` — é a opinião sobre SER PERGUNTADO, e desligá-la é o modo
 * pré-aprovado, o equivalente do `--dangerously-skip-permissions` do claude.
 *
 * NÃO existe um segundo booleano de "pré-aprovar MCP". Um campo novo significando "não me pergunte
 * sobre aprovação" seria redeclaração de uma decisão que já tem dono — exatamente o que a regra de
 * modelagem deste repo proíbe.
 *
 * A combinação perigosa é `ASK` com `approvalNeeded: false`. Resolvê-la como "gateia" produziria uma
 * chamada BLOQUEADA PARA SEMPRE: o gate tentaria levantar um `APPROVAL_NEEDED` que a política do dono
 * proíbe, e não haveria caminho de aprovação nenhum. Por isso ela resolve como EXECUTA — o dono
 * declarou que não quer ser perguntado, e essa declaração vale para as duas vozes que perguntam (o
 * modelo, via `RaiseStop`, e o proxy).
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
export type McpCallDisposition = 'execute' | 'gate'

export function resolveMcpCallDisposition(input: {
	serverPolicy: McpApprovalPolicy
	/**
	 * Override da FERRAMENTA, quando o dono declarou um. Vence a política do servidor, e é o que torna
	 * um servidor como o `browser-use` utilizável e gateado ao mesmo tempo: `browser_click` em AUTO,
	 * `retry_with_browser_use_agent` — que executa uma sessão inteira dirigida por outro modelo — em ASK.
	 */
	toolPolicy?: McpApprovalPolicy
	ownerWantsToBeAsked: boolean
}): McpCallDisposition {
	const effective = input.toolPolicy ?? input.serverPolicy
	if (effective !== McpApprovalPolicy.ASK) return 'execute'
	// O pré-aprovado global vence tudo, inclusive um override de ferramenta: gatear aqui produziria uma
	// chamada bloqueada sem NENHUM caminho de aprovação, já que o dono proibiu o stop que a liberaria.
	return input.ownerWantsToBeAsked ? 'gate' : 'execute'
}
