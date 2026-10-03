// packages/api/typescript/src/agent/handlers/SettleMcpToolApproval.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@codm/core-typescript'
import { ThreadStopResolvedEvent } from '@codm/contracts-typescript/wire/events'
import { StopResolution, McpApprovalDecision } from '@codm/contracts-typescript/wire/enums'
import { McpToolApprovalRepository } from '../repositories/McpToolApprovalRepository'

/**
 * T8 — "aprovado, a mesma chamada passa no turno seguinte".
 *
 * O dono responde o stop no `thread` (`ResolveStop`), que levanta `thread.stop_resolved` e o bridge
 * `PublishThreadIntegrationEvents` republica como `integration.thread.stop_resolved` — o ÚNICO jeito
 * desta decisão chegar até `agent`, que NÃO PODE importar `thread` (contrato desta task). Este é o
 * subscriber que fecha o loop: a resposta do dono vira o flip PENDENTE → APPROVED/DENIED na linha que
 * `RequestMcpToolApproval` gravou.
 *
 * ### Não executa a chamada
 * A aprovação registra a PERMISSÃO; é o próximo turno do agente que reemite o `tools/call` contra o
 * proxy (que agora encontra a linha decidida e libera ou recusa — T5/T7, já congelados). Executar a
 * ferramenta AQUI poria o daemon rodando algo fora de um turno — sem token, sem identidade e sem turno
 * para receber o resultado.
 *
 * ### Deliberadamente TOLERANTE, três vezes
 * 1. **`stopId` desconhecido é NO-OP, não erro.** A maioria dos stops resolvidos no produto não tem
 *    nada a ver com MCP (RETRY de execução, HUMAN_REQUESTED, etc.) — nenhuma linha existir é o caso
 *    normal, não um defeito.
 * 2. **Resolução que não é APPROVE nem DENY deixa a aprovação PENDENTE.** `APPROVAL_NEEDED` admite
 *    outras respostas (`TAKE_OVER` pausa a thread para o operador assumir a conversa e não decide nada
 *    sobre a ferramenta; `RETRY`/`REVIEW_AND_SEND` são de outros kinds e nunca deveriam bater aqui, mas
 *    o mapeamento os trata da mesma forma por segurança).
 * 3. **Uma aprovação já assentada é NO-OP, não erro.** O outbox entrega at-least-once; uma redelivery do
 *    MESMO fato bateria em `McpToolApproval.settle()` pela segunda vez e levantaria
 *    `MCP_APPROVAL_ALREADY_SETTLED` — checar `isPending` antes torna a redelivery idempotente em vez de
 *    uma falha que o outbox tentaria para sempre.
 */
@injectable()
export class SettleMcpToolApproval extends EventHandler<typeof ThreadStopResolvedEvent> {
	readonly event = ThreadStopResolvedEvent

	constructor(private readonly approvals: McpToolApprovalRepository) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const decision = toDecision(event.payload.resolution)
		if (!decision) return

		const approval = await this.approvals.findByStopId(event.payload.stopId)
		if (!approval?.isPending) return

		approval.settle(decision)
		await this.approvals.save(approval)
	}
}

/** APPROVE/DENY são os únicos vereditos que dizem respeito a uma chamada MCP; qualquer outra resolução
 * (`TAKE_OVER`, `RETRY`, `REVIEW_AND_SEND`) não é uma decisão sobre a ferramenta. */
function toDecision(resolution: StopResolution): McpApprovalDecision | undefined {
	switch (resolution) {
		case StopResolution.APPROVE:
			return McpApprovalDecision.APPROVED
		case StopResolution.DENY:
			return McpApprovalDecision.DENIED
		default:
			return undefined
	}
}
