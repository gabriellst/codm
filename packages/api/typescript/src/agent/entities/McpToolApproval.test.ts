import { describe, it, expect } from 'bun:test'
import { McpApprovalDecision } from '@codm/contracts-typescript/wire/enums'
import { McpToolApproval, canonicalCallHash } from './McpToolApproval'

describe('McpToolApproval', () => {
	const base = {
		ownerId: '019e4d24-6524-7041-9e1c-8108180cdd01',
		issueId: '019e4d24-6524-7041-9e1c-8108180cdd02',
		threadId: '019e4d24-6524-7041-9e1c-8108180cdd03',
		serverKey: 'shell',
		toolName: 'run',
		stopId: '019e4d24-6524-7041-9e1c-8108180cdd04',
	}

	it('nasce pendente e não autoriza execução', () => {
		const approval = McpToolApproval.request({ ...base, args: { cmd: 'ls' } })
		expect(approval.isPending).toBe(true)
		expect(approval.grantsExecution).toBe(false)
	})

	it('APPROVED autoriza; DENIED não', () => {
		const approved = McpToolApproval.request({ ...base, args: { cmd: 'ls' } })
		approved.settle(McpApprovalDecision.APPROVED)
		expect(approved.grantsExecution).toBe(true)

		const denied = McpToolApproval.request({ ...base, args: { cmd: 'ls' } })
		denied.settle(McpApprovalDecision.DENIED)
		expect(denied.grantsExecution).toBe(false)
	})

	it('não reabre decisão já respondida', () => {
		const approval = McpToolApproval.request({ ...base, args: { cmd: 'ls' } })
		approval.settle(McpApprovalDecision.DENIED)
		expect(() => approval.settle(McpApprovalDecision.APPROVED)).toThrow()
	})

	it('o hash ignora ordem de chaves e espaçamento, mas não valor', () => {
		const a = canonicalCallHash({ serverKey: 'shell', toolName: 'run', args: { cmd: 'ls', cwd: '/tmp' } })
		const b = canonicalCallHash({ serverKey: 'shell', toolName: 'run', args: { cwd: '/tmp', cmd: 'ls' } })
		const c = canonicalCallHash({ serverKey: 'shell', toolName: 'run', args: { cmd: 'ls ', cwd: '/tmp' } })
		expect(a).toBe(b)
		expect(a).not.toBe(c)
	})

	it('argumentos iguais em ferramentas diferentes NÃO casam', () => {
		const a = canonicalCallHash({ serverKey: 'shell', toolName: 'run', args: { x: 1 } })
		const b = canonicalCallHash({ serverKey: 'shell', toolName: 'delete', args: { x: 1 } })
		expect(a).not.toBe(b)
	})
})
