// packages/api/typescript/src/agent/repositories/McpToolApprovalRepository/McpToolApprovalRepository.ts — arquivo final COMPLETO
import { Repository } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import type { McpToolApproval } from '../../entities/McpToolApproval'

/**
 * Duas leituras, e cada uma serve um momento distinto do fluxo: `findByStopId` é como o handler
 * encontra a linha quando o dono responde o stop, e `findByCall` é a pergunta do replay — "esta
 * chamada, NESTA issue, já foi decidida?". O `issueId` no segundo faz o confinamento ser cláusula de
 * WHERE em vez de regra que alguém precisa lembrar de aplicar.
 */
export abstract class McpToolApprovalRepository extends Repository<McpToolApproval> {
	abstract findById(id: string, tx?: Transaction): Promise<McpToolApproval | undefined>
	abstract findByStopId(stopId: string, tx?: Transaction): Promise<McpToolApproval | undefined>
	abstract findByCall(issueId: string, callHash: string, tx?: Transaction): Promise<McpToolApproval | undefined>
}
