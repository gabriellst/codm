// packages/api/typescript/src/agent/repositories/McpToolApprovalRepository/MockMcpToolApprovalRepository.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@codm/core-typescript'
import type { McpToolApproval } from '../../entities/McpToolApproval'
import { McpToolApprovalRepository } from './McpToolApprovalRepository'

@injectable()
export class MockMcpToolApprovalRepository extends McpToolApprovalRepository {
	private readonly rows = new Map<string, McpToolApproval>()

	async findById(id: string, _tx?: Transaction): Promise<McpToolApproval | undefined> {
		return this.rows.get(id)
	}

	async findByStopId(stopId: string, _tx?: Transaction): Promise<McpToolApproval | undefined> {
		return [...this.rows.values()].find(a => a.stopId === stopId)
	}

	async findByCall(issueId: string, callHash: string, _tx?: Transaction): Promise<McpToolApproval | undefined> {
		return [...this.rows.values()].find(a => a.issueId === issueId && a.callHash === callHash)
	}

	async findPendingByCall(issueId: string, callHash: string, _tx?: Transaction): Promise<McpToolApproval | undefined> {
		return [...this.rows.values()].find(a => a.issueId === issueId && a.callHash === callHash && a.decision === undefined)
	}

	async save(entity: McpToolApproval, _tx?: Transaction): Promise<McpToolApproval> {
		entity.incrementVersion()
		this.rows.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string, _tx?: Transaction): Promise<void> {
		this.rows.delete(id)
	}
}
