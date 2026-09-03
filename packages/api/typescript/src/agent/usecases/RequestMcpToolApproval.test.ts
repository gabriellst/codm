import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenIssue, givenThread } from '@test/support'
import { DomainEventRepository } from '@codm/core-typescript'
import { StopKind } from '@codm/contracts-typescript/wire/enums'
import { ThreadStopRaisedEvent } from '@codm/contracts-typescript/wire/events'
import { RecordStopFromExecution } from '@thread/handlers/RecordStopFromExecution'
import { AgentRunStopRaisedEvent } from '../events/AgentRunStopRaisedEvent'
import { McpToolApprovalRepository } from '../repositories/McpToolApprovalRepository'
import { GetOpenStops } from './GetOpenStops'
import { RequestMcpToolApproval } from './RequestMcpToolApproval'

/**
 * `RequestMcpToolApproval` só grava o FATO no próprio contexto (o domain event + a linha PENDENTE) —
 * quem materializa isso na fila Needs-you do dono é `RecordStopFromExecution`, do lado `thread`,
 * reagindo ao integration event cross-context. Em produção o outbox entrega isso sozinho; sob o
 * `TestBed` em modo `integration` NENHUM dispatcher está de pé (o mesmo motivo documentado em
 * `ReconcileStalledIssues.test.ts` e `tests/flows/stop-control-plane.flow.test.ts`), então este teste
 * invoca o handler diretamente com o `kind`/`detail` REALMENTE persistidos pelo domain event — provando
 * que `RequestMcpToolApproval` escreveu o texto certo, e só então checando que ele chega a `GetOpenStops`.
 */
describe('RequestMcpToolApproval', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	const ownerId = '019e4d24-6524-7041-9e1c-8108180cdd01'

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	/** Materializa o stop na fila Needs-you a partir do fato REALMENTE persistido para `stopId`. */
	async function materializeStop(stopId: string, issueId: string, threadId: string): Promise<void> {
		const raised = (await testBed.resolve(DomainEventRepository).findByType(AgentRunStopRaisedEvent)).find(
			event => event.payload.stopId === stopId,
		)
		await testBed.resolve(RecordStopFromExecution).handle(
			new ThreadStopRaisedEvent({
				ownerId,
				payload: { stopId, issueId, threadId, kind: raised!.payload.kind, detail: raised!.payload.detail },
			}) as never,
		)
	}

	it('grava a chamada PENDENTE e levanta um APPROVAL_NEEDED que carrega servidor, ferramenta e argumentos', async () => {
		const thread = await givenThread(testBed, { ownerId })
		const issue = await givenIssue(testBed, { ownerId, threadId: thread.id.value })

		const { stopId } = await testBed.resolve(RequestMcpToolApproval).execute({
			ownerId,
			issueId: issue.id.value,
			threadId: issue.threadId,
			serverKey: 'shell',
			toolName: 'run',
			args: { cmd: 'rm -rf build' },
		})

		await materializeStop(stopId, issue.id.value, issue.threadId)

		const { stops } = await testBed.resolve(GetOpenStops).execute({ threadId: issue.threadId })
		const raised = stops.find(s => s.stopId === stopId)
		expect(raised?.kind).toBe(StopKind.APPROVAL_NEEDED)
		expect(raised?.detail).toContain('shell')
		expect(raised?.detail).toContain('run')
		expect(raised?.detail).toContain('rm -rf build')

		const pending = await testBed.resolve(McpToolApprovalRepository).findByStopId(stopId)
		expect(pending?.decision).toBeUndefined()
	})

	it('a mesma chamada pedida duas vezes no mesmo run reaproveita o pedido pendente em vez de encher o card', async () => {
		const thread = await givenThread(testBed, { ownerId })
		const issue = await givenIssue(testBed, { ownerId, threadId: thread.id.value })
		const call = { ownerId, issueId: issue.id.value, threadId: issue.threadId, serverKey: 'shell', toolName: 'run', args: { cmd: 'ls' } }

		const first = await testBed.resolve(RequestMcpToolApproval).execute(call)
		const second = await testBed.resolve(RequestMcpToolApproval).execute(call)

		expect(second.stopId).toBe(first.stopId)

		await materializeStop(first.stopId, issue.id.value, issue.threadId)

		const { stops } = await testBed.resolve(GetOpenStops).execute({ threadId: issue.threadId })
		expect(stops.filter(s => s.kind === StopKind.APPROVAL_NEEDED).length).toBe(1)
	})
})
