// packages/api/typescript/src/agent/repositories/McpToolApprovalRepository/McpToolApprovalRepository.ts — arquivo final COMPLETO
import { Repository } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import type { McpToolApproval } from '../../entities/McpToolApproval'

/**
 * TRÊS leituras, e cada uma serve um momento distinto do fluxo: `findByStopId` é como o handler
 * encontra a linha quando o dono responde o stop; `findByCall` é a pergunta do DOOR — "esta chamada,
 * NESTA issue, pode rodar agora?", sem filtrar por decisão, porque o door precisa do veredito mais
 * recente seja ele qual for; `findPendingByCall` é a pergunta do USE CASE ao decidir se reaproveita o
 * card — só serve uma linha ainda PENDENTE, porque devolver uma já decidida seria reabrir um card que
 * o dono já respondeu e nunca mais vai ver. O `issueId` nos dois últimos faz o confinamento ser
 * cláusula de WHERE em vez de regra que alguém precisa lembrar de aplicar.
 */
export abstract class McpToolApprovalRepository extends Repository<McpToolApproval> {
	abstract findById(id: string, tx?: Transaction): Promise<McpToolApproval | undefined>
	abstract findByStopId(stopId: string, tx?: Transaction): Promise<McpToolApproval | undefined>
	abstract findByCall(issueId: string, callHash: string, tx?: Transaction): Promise<McpToolApproval | undefined>
	abstract findPendingByCall(issueId: string, callHash: string, tx?: Transaction): Promise<McpToolApproval | undefined>
}
