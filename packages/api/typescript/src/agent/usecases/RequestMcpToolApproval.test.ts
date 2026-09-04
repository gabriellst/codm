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
import { canonicalCallHash } from '../entities/McpToolApproval'
import { RequestMcpToolApproval, maskSensitiveArgs } from './RequestMcpToolApproval'

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

	/**
	 * O TEXTO DO CARD É PERSISTIDO. `issue_stops.detail` guarda esta string para sempre, e o card a
	 * renderiza — então um argumento sensível que passe por aqui vira uma cópia em claro de um segredo,
	 * nossa e permanente. Medido no app real: uma chamada gateada grava os argumentos em DUAS colunas
	 * (`agent_mcp_tool_approvals.call_arguments` e `issue_stops.detail`).
	 */
	describe('mascaramento de argumentos sensíveis', () => {
		it('mascara por PALAVRA da chave, inclusive aninhada, e não estraga o que é inocente', () => {
			const masked = maskSensitiveArgs({
				apiKey: 'sk-live-DEVERIA-SUMIR',
				access_token: 'ghp_DEVERIA_SUMIR',
				'x-authorization': 'Bearer DEVERIA-SUMIR',
				config: { nested: { password: 'DEVERIA-SUMIR' } },
				headers: [{ Cookie: 'DEVERIA-SUMIR' }],
				// Inocentes: casam por SUBSTRING com `key`/`auth`, e é justamente o que um regex solto erraria.
				keyboard: 'permanece',
				monkey: 'permanece',
				author: 'permanece',
				location: 'Chicago',
				a: 17,
			})

			const flat = JSON.stringify(masked)
			expect(flat).not.toContain('DEVERIA')
			expect(flat).not.toContain('sk-live')
			expect(flat).not.toContain('ghp_')

			expect(masked).toMatchObject({
				keyboard: 'permanece',
				monkey: 'permanece',
				author: 'permanece',
				location: 'Chicago',
				a: 17,
			})
		})

		/**
		 * A METADE QUE IMPORTA MAIS QUE O MASCARAMENTO.
		 *
		 * Se o hash fosse calculado sobre a forma MASCARADA, duas chamadas com segredos diferentes
		 * colidiriam no mesmo `callHash`. Como `(issueId, callHash)` é ÚNICO e responde "esta chamada
		 * pode rodar agora?", a aprovação dada para uma passaria a valer para a outra — o mascaramento
		 * viraria escalada de privilégio. Este teste é o que impede alguém de "simplificar" mascarando
		 * antes do hash.
		 */
		it('o hash canônico NÃO é mascarado — dois segredos distintos seguem sendo chamadas distintas', () => {
			const base = { serverKey: 'vault', toolName: 'read' }
			const um = canonicalCallHash({ ...base, args: { apiKey: 'sk-AAA' } })
			const outro = canonicalCallHash({ ...base, args: { apiKey: 'sk-BBB' } })

			expect(um).not.toBe(outro)

			// E a contraprova do que aconteceria se alguém hasheasse a forma mascarada:
			const mascaradoUm = canonicalCallHash({ ...base, args: maskSensitiveArgs({ apiKey: 'sk-AAA' }) as Record<string, unknown> })
			const mascaradoOutro = canonicalCallHash({ ...base, args: maskSensitiveArgs({ apiKey: 'sk-BBB' }) as Record<string, unknown> })
			expect(mascaradoUm).toBe(mascaradoOutro)
		})
	})
})
