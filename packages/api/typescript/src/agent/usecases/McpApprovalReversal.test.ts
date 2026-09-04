import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenIssue } from '@test/support'
import { StopResolution } from '@codm/contracts-typescript/wire/enums'
import { ThreadStopResolvedEvent } from '@codm/contracts-typescript/wire/events'
import { SettleMcpToolApproval } from '../handlers/SettleMcpToolApproval'
import { canonicalCallHash } from '../entities/McpToolApproval'
import { McpToolApprovalRepository } from '../repositories/McpToolApprovalRepository'
import { RequestMcpToolApproval } from './RequestMcpToolApproval'

/**
 * O DONO MUDOU DE IDEIA — o ciclo DENY → o agente tenta de novo → APPROVE.
 *
 * As suítes vizinhas param no PRIMEIRO settle: `SettleMcpToolApproval.test` prova o flip, e
 * `McpApprovalConfinement` prova o WHERE cross-issue. Nenhuma segue a chamada DEPOIS de um DENY, e é
 * ali que o recurso tinha dois defeitos que se escondem um no outro:
 *
 *  (a) `findByCall` é `SELECT … LIMIT 1` SEM `ORDER BY` sobre um índice NÃO-único em
 *      `(issue_id, call_hash)`. Com duas linhas para a mesma chamada, qual delas volta é
 *      indeterminado — e na prática é a mais ANTIGA (ordem de rowid no scan do índice).
 *  (b) `RequestMcpToolApproval` só reaproveita quando a linha achada está PENDENTE. Achando a
 *      DENIED, ele levanta um stop NOVO e grava uma linha nova a CADA tentativa.
 *
 * Juntos: o retry depois do DENY enche o Needs-you de perguntas duplicadas, e quando o dono
 * finalmente aprova uma delas, o door continua lendo a linha velha DENIED — a chamada nunca libera.
 * O caminho "DENY mantém recusando" (que os testes cobrem) fica verde enquanto o caminho "mudei de
 * ideia" está morto.
 */
describe('McpApprovalReversal — DENY, novo pedido, APPROVE', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	const ownerId = '019e4d24-6524-7041-9e1c-8108180cdd07'

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

	async function settle(stopId: string, issueId: string, threadId: string, resolution: StopResolution) {
		await testBed.resolve(SettleMcpToolApproval).handle(
			new ThreadStopResolvedEvent({
				ownerId,
				payload: { stopId, issueId, threadId, resolution },
			}) as never,
		)
	}

	it('depois de um DENY, o pedido seguinte REAPROVEITA o card em vez de abrir outro', async () => {
		const issue = await givenIssue(testBed, { ownerId })
		const call = { serverKey: 'shell', toolName: 'run', args: { cmd: 'rm -rf /' } }
		const request = testBed.resolve(RequestMcpToolApproval)
		const base = { ownerId, issueId: issue.id.value, threadId: issue.threadId, ...call }

		const first = await request.execute(base)
		await settle(first.stopId, issue.id.value, issue.threadId, StopResolution.DENY)

		const second = await request.execute(base)
		const third = await request.execute(base)

		// O card do dono não pode multiplicar: o segundo pedido abre UM stop novo (o anterior foi
		// respondido e não serve mais), e o terceiro tem de reaproveitar ESSE — senão cada turno do
		// agente vira uma pergunta a mais na fila do dono.
		expect(second.stopId).not.toBe(first.stopId)
		expect(third.stopId).toBe(second.stopId)
	})

	it('o APPROVE do pedido novo LIBERA a chamada — o veredito que vale é o mais recente', async () => {
		const issue = await givenIssue(testBed, { ownerId })
		const call = { serverKey: 'shell', toolName: 'run', args: { cmd: 'ls' } }
		const request = testBed.resolve(RequestMcpToolApproval)
		const base = { ownerId, issueId: issue.id.value, threadId: issue.threadId, ...call }

		const denied = await request.execute(base)
		await settle(denied.stopId, issue.id.value, issue.threadId, StopResolution.DENY)

		const reopened = await request.execute(base)
		await settle(reopened.stopId, issue.id.value, issue.threadId, StopResolution.APPROVE)

		// A leitura que o DOOR faz, com os mesmos argumentos: é ela que decide executar ou recusar.
		const found = await testBed.resolve(McpToolApprovalRepository).findByCall(issue.id.value, canonicalCallHash(call))

		expect(found?.grantsExecution).toBe(true)
	})

	it('o inverso também vale: APPROVE e depois DENY volta a recusar', async () => {
		const issue = await givenIssue(testBed, { ownerId })
		const call = { serverKey: 'shell', toolName: 'run', args: { cmd: 'whoami' } }
		const request = testBed.resolve(RequestMcpToolApproval)
		const base = { ownerId, issueId: issue.id.value, threadId: issue.threadId, ...call }

		const approved = await request.execute(base)
		await settle(approved.stopId, issue.id.value, issue.threadId, StopResolution.APPROVE)

		// Sem esta metade, um "o mais recente vence" implementado como "o APPROVED vence" passaria.
		const revoked = await request.execute(base)
		await settle(revoked.stopId, issue.id.value, issue.threadId, StopResolution.DENY)

		const found = await testBed.resolve(McpToolApprovalRepository).findByCall(issue.id.value, canonicalCallHash(call))

		expect(found?.grantsExecution).toBe(false)
	})
})
