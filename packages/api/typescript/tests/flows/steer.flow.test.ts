import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread, givenWorkspace, givenIssue } from '@test/support'
import { BaseError } from '@codm/core-typescript'
import { IssueStatus, MailboxItemKind, MailboxTargetKind, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { MailboxRepository } from '@agent/repositories'
import { SteerIssueTurnController } from '@agent/controllers/SteerIssueTurn'
import { SteerIssueTurn } from '@agent/usecases/SteerIssueTurn'
import { SteerThread } from '@thread/usecases/SteerThread'
import { MailboxDispatcher } from '@agent/services/MailboxDispatcher'
import { AgentSessionRepository } from '@agent/repositories'
import { IssueRepository } from '@issue/repositories'
import { ArchiveIssue } from '@issue/usecases'

/**
 * B2 — THE STEER ACTUALLY REDIRECTS SOMETHING.
 *
 * Before this, `thread.steered` had ZERO consumers: the whisper was written to the transcript and
 * nothing ever acted on it. The founder hit it directly — "mandei steer e ele não perguntou de novo" —
 * and the transcript still shows the orphaned `WHISPER` row from that attempt.
 *
 * Two paths are covered, and the second is a deliberate extension of §7.7 (flagged, not smuggled):
 * a whisper sent while NOTHING is running is a message for the ORCHESTRATOR, not a steer into the void.
 */
describe('Flow (integration): a whisper schedules a turn', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeEach(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const thread = async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		return givenThread(testBed, { ownerId: OPERATOR_ID, workspaceId: workspace.id.value, providers: [ProviderKind.CLAUDE_CODE] })
	}

	it('AC-B2.2 — a whisper with an open issue queues a STEER for it', async () => {
		const t = await thread()
		const issue = await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: t.id.value, key: 'odisseu-resumo' })

		await testBed.resolve(SteerThread).execute({ ownerId: OPERATOR_ID, threadId: t.id.value, text: 'prefira o resumo curto' })

		const queued = await testBed.resolve(MailboxRepository).claimNext('steer-test', 60_000)
		expect(queued?.kind).toBe(MailboxItemKind.STEER)
		expect(queued?.targetKind).toBe(MailboxTargetKind.ISSUE)
		expect(queued?.targetId).toBe(issue.id.value)
		// The steer's OWN text — a resumed session needs the new instruction, not the original brief.
		//
		// PRE-EXISTING violation, byte-identical in the HEAD blob, surfaced here only because B2 T7 is
		// the first change to stage this file. The short-circuit the rule warns about cannot happen and
		// would not matter if it did: `queued` is asserted non-null by the three `expect`s directly
		// above, and a `TypeError` on this line fails the test exactly as the assertion would. Dropping
		// the `?.` is the real fix and it belongs to whoever owns this suite's null-handling, not to a
		// commit about identity middleware.
		// biome-ignore lint/correctness/noUnsafeOptionalChaining: pre-existing, see the note above
		expect((queued?.payload as { text: string }).text).toBe('prefira o resumo curto')
	})

	/**
	 * The founder's actual scenario: "pergunte mais uma vez se ele está bem", with no issue in flight.
	 * §7.7 defines steer only against issues, so under a literal reading this would still do nothing —
	 * which is why it is treated as a message to the orchestrator instead.
	 */
	it('a whisper with NO open issue becomes a message to the orchestrator', async () => {
		const t = await thread()

		await testBed
			.resolve(SteerThread)
			.execute({ ownerId: OPERATOR_ID, threadId: t.id.value, text: 'pergunte mais uma vez se ele está bem' })

		const queued = await testBed.resolve(MailboxRepository).claimNext('steer-test', 60_000)
		expect(queued?.kind).toBe(MailboxItemKind.OPERATOR_MESSAGE)
		expect(queued?.targetKind).toBe(MailboxTargetKind.THREAD)
		expect(queued?.targetId).toBe(t.id.value)
	})

	/**
	 * AC-B2.1 — the queued STEER is actually RUN, not merely stored. A steer that only reaches the table
	 * is the same silence the founder complained about, one layer deeper.
	 */
	it('AC-B2.1 — the dispatcher runs the queued STEER as a subagent turn', async () => {
		const t = await thread()
		const issue = await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: t.id.value, key: 'odisseu-resumo' })

		await testBed.resolve(SteerThread).execute({ ownerId: OPERATOR_ID, threadId: t.id.value, text: 'prefira o resumo curto' })

		// TWO turns, and the second one is B1 and B2 composing: the STEER runs the subagent, that turn's
		// outcome queues an ISSUE_RESULT for the thread, and the same drain picks it up and composes the
		// answer. One `drain()` carries the redirection all the way back to the conversation.
		expect(await testBed.resolve(MailboxDispatcher).bind(testContainer).drain()).toBe(2)

		// The steer turn ran: a durable session row exists for the ISSUE, which only `RunIssueTurn` writes.
		const session = await testBed.resolve(AgentSessionRepository).findByIssueId(issue.id.value)
		expect(session).toBeDefined()
	})

	/**
	 * AC-B2.3 — the confinement the generic comparison cannot provide. An `orchestration` identity
	 * carries no `issueId` at all, so `compareIdentity` has nothing to compare that key against; without
	 * the handler's own check, a model reading a group chat could redirect work belonging to another
	 * conversation.
	 */
	it('AC-B2.3 — a run on thread A cannot steer an issue of thread B', async () => {
		const a = await thread()
		const b = await thread()
		const foreign = await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: b.id.value, key: 'foreign' })

		const controller = testBed.resolve(SteerIssueTurnController)
		await expect(
			controller.handle({
				ctx: { ownerId: OPERATOR_ID, agentIdentity: { threadId: a.id.value } },
				params: { threadId: a.id.value, issueId: foreign.id.value },
				body: { text: 'muda de rumo' },
			} as Parameters<SteerIssueTurnController['handle']>[0]),
		).rejects.toThrow(/no steerable issue with that id on this thread/)
	})

	it('the same run steering its OWN open issue succeeds — the check is not "refuse everything"', async () => {
		const t = await thread()
		const own = await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: t.id.value, key: 'own' })

		const response = await testBed.resolve(SteerIssueTurnController).handle({
			ctx: { ownerId: OPERATOR_ID, agentIdentity: { threadId: t.id.value, entryId: '019fac48-06c6-7a11-afdf-29fff08d4a81' } },
			params: { threadId: t.id.value, issueId: own.id.value },
			body: { text: 'muda de rumo' },
		} as Parameters<SteerIssueTurnController['handle']>[0])

		expect(response.data.queued).toBe(true)
	})
})

/** Cria owner, workspace, thread e uma issue já `COMPLETED` — o alvo legítimo que este redirecionamento existe para alcançar. */
async function givenCompletedIssue(testBed: TestBed) {
	const workspace = await givenWorkspace(testBed, { ownerId: testBed.ownerId })
	const thread = await givenThread(testBed, {
		ownerId: testBed.ownerId,
		workspaceId: workspace.id.value,
		providers: [ProviderKind.CLAUDE_CODE],
	})
	const issue = await givenIssue(testBed, { ownerId: testBed.ownerId, threadId: thread.id.value, status: IssueStatus.COMPLETED })
	return { thread, issue }
}

describe('steer direcionado numa issue concluída', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeEach(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('reabre a issue e enfileira o STEER', async () => {
		const { thread, issue } = await givenCompletedIssue(testBed)
		const steer = testBed.resolve(SteerIssueTurn)

		await steer.execute({
			ownerId: testBed.ownerId,
			threadId: thread.id.value,
			issueId: issue.id.value,
			entryId: '019e4d24-6524-7041-9e1c-8108180cddb0',
			text: 'já pode subir o PR',
		})

		const reopened = await testBed.resolve(IssueRepository).findById(issue.id.value)
		expect(reopened?.status).toBe(IssueStatus.WORKING)
		expect(reopened?.completedAt).toBeUndefined()

		const mailbox = testBed.resolve(MailboxRepository)
		expect(await mailbox.hasPending(MailboxTargetKind.ISSUE, issue.id.value)).toBe(true)
	})

	it('recusa issue de outra thread e issue arquivada de forma INDISTINGUÍVEL', async () => {
		const steer = testBed.resolve(SteerIssueTurn)
		const { thread } = await givenCompletedIssue(testBed)
		const foreign = await givenCompletedIssue(testBed)
		const archived = await givenCompletedIssue(testBed)
		await testBed.resolve(ArchiveIssue).execute({ ownerId: testBed.ownerId, issueId: archived.issue.id.value })

		const errors: string[] = []
		for (const issueId of [foreign.issue.id.value, archived.issue.id.value]) {
			try {
				await steer.execute({
					ownerId: testBed.ownerId,
					threadId: thread.id.value,
					issueId,
					entryId: '019e4d24-6524-7041-9e1c-8108180cddb0',
					text: 'já pode subir o PR',
				})
				throw new Error('deveria ter recusado')
			} catch (error) {
				errors.push(error instanceof BaseError ? `${error.name}:${error.message}` : String(error))
			}
		}

		// A propriedade: as duas recusas são a MESMA string. Responder diferente faria deste endpoint
		// um oráculo de ids — dá para varrer uuids e descobrir quais existem.
		expect(errors[0]).toBe(errors[1])
		expect(errors[0]).toContain('AGENT_RUN_SCOPE_MISMATCH')
	})

	it('não deixa a issue reaberta quando o enfileiramento falha', async () => {
		const { thread, issue } = await givenCompletedIssue(testBed)
		const steer = testBed.resolve(SteerIssueTurn)
		const mailbox = testBed.resolve(MailboxRepository)
		const boom = new Error('mailbox down')
		mailbox.enqueue = async () => {
			throw boom
		}

		await expect(
			steer.execute({
				ownerId: testBed.ownerId,
				threadId: thread.id.value,
				issueId: issue.id.value,
				entryId: '019e4d24-6524-7041-9e1c-8108180cddb0',
				text: 'já pode subir o PR',
			}),
		).rejects.toThrow('mailbox down')

		// Mesma transação: sem STEER na fila, a issue NÃO ficou em WORKING.
		const after = await testBed.resolve(IssueRepository).findById(issue.id.value)
		expect(after?.status).toBe(IssueStatus.COMPLETED)
	})

	it('o whisper da thread continua não alcançando issue concluída', async () => {
		const { thread, issue } = await givenCompletedIssue(testBed)
		await testBed.resolve(SteerThread).execute({ ownerId: testBed.ownerId, threadId: thread.id.value, text: 'muda o rumo' })

		const mailbox = testBed.resolve(MailboxRepository)
		expect(await mailbox.hasPending(MailboxTargetKind.ISSUE, issue.id.value)).toBe(false)
	})
})
