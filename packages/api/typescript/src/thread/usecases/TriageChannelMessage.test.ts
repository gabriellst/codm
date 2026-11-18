import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import type { ZodType } from 'zod'
import { agentMailbox, scheduledCommands } from '@codm/contracts/db'
import { CommandQueue, DomainEventRepository, LibSqlCommandQueue, LibSqlDatabaseDriver, MockLoggingService } from '@codm/core-typescript'
import {
	ClassificationMethod,
	IssueStatus,
	MailboxItemKind,
	MailboxTargetKind,
	MessageType,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenThread, GIVEN_MENTION_TAG } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { AgentRunner } from '@agent/services/AgentRunner'
import { AgentRunnerFactory, FixedAgentRunnerFactory } from '@agent/services/AgentRunnerFactory'
import { InboundTriage, ModelInboundTriage, TRIAGE_HOLDER } from '@agent/services/InboundTriage'
import { AgentName, AgentRunOutcome, TriageDecision } from '@agent/enums'
import type { AgentRunRequest } from '@agent/types/AgentRunRequest'
import type { AgentRuntimeEvent } from '@agent/types/AgentRuntimeEvent'
import { IngestChannelMessage } from './IngestChannelMessage'
import { TriageChannelMessage } from './TriageChannelMessage'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { InboundTriageQueue } from '../services/InboundTriageQueue'
import { MessageTriagedEvent } from '../events/MessageTriagedEvent'
import { CUE_ACKNOWLEDGED, CUE_READ } from '../utils/ChannelCues'

/** What the stub model answers for one message: a verdict, a failure, or nothing until aborted. */
type Script = { confidence: number; verdict: Record<string, unknown> } | 'fail' | 'hang'

/**
 * The triage's model, stubbed — never a CLI. Each TRIAGE run answers by the script for the message it
 * reads (matched on the message text in the prompt). `gate` holds every run until released, so a test
 * can see how many are in flight at once.
 */
class ScriptedTriageRunner extends AgentRunner {
	readonly requests: AgentRunRequest<ZodType | undefined>[] = []
	scripts = new Map<string, Script>()
	inFlight = 0
	maxInFlight = 0
	aborted = 0
	gate: Promise<void> | undefined

	reset(): void {
		this.requests.length = 0
		this.scripts.clear()
		this.inFlight = 0
		this.maxInFlight = 0
		this.aborted = 0
		this.gate = undefined
	}

	async *run<OutputSchema extends ZodType | undefined = undefined>(
		request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent> {
		if (request.agentName !== AgentName.TRIAGE) throw new Error(`unexpected ${request.agentName} run`)
		this.requests.push(request)
		this.inFlight += 1
		this.maxInFlight = Math.max(this.maxInFlight, this.inFlight)
		try {
			if (this.gate) await this.gate
			// The message to triage is the LAST line of the prompt — earlier lines are the tail and the issues.
			const message =
				request.messages
					.map(m => m.content)
					.join('\n')
					.split('\n')
					.at(-1) ?? ''
			const script = [...this.scripts].find(([text]) => message.includes(text))?.[1] ?? 'fail'
			if (script === 'fail') throw new Error('provider exploded')
			if (script === 'hang') {
				await new Promise<void>(resolve => request.signal?.addEventListener('abort', () => resolve(), { once: true }))
				this.aborted += 1
				yield {
					type: 'finished',
					result: { outcome: AgentRunOutcome.STOPPED, replyText: '', sessionId: null, failed: true, failure: 'killed' },
				}
				return
			}
			yield {
				type: 'finished',
				result: { outcome: AgentRunOutcome.COMPLETED, replyText: '', sessionId: null, output: script, failed: false },
			}
		} finally {
			this.inFlight -= 1
		}
	}

	async shutdown(): Promise<void> {}
}

/** The production policy with a short budget, so the timeout case takes milliseconds. */
class QuickModelInboundTriage extends ModelInboundTriage {
	protected override timeoutMs = 150
}

const steer = (issueKey: string, confidence = 0.95): Script => ({ confidence, verdict: { decision: TriageDecision.STEER, issueKey } })

/**
 * TRIAGEM PARALELA (fase 2) — a message the rule layer cannot route is triaged by a stateless run on the
 * small model, in parallel, instead of waiting in the orchestrator's single queue.
 *
 * Measured end to end through the real ingest (the orchestrator's item queued HELD), the real pool, the
 * real `ModelInboundTriage` policy and the real mailbox — only the model is a stub.
 *
 * Falsifiers: drop the `hold` from the ingest and the orchestrator claims the item before the triage
 * (the held-item assertions fail); drop the CAS predicate from `settleHold` and the late verdict consumes
 * an item the orchestrator already holds; drop the confidence floors and the low-confidence steer is routed.
 */
describe('parallel triage of an unrouted message', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let queue: LibSqlCommandQueue
	let driver: LibSqlDatabaseDriver
	const runner = new ScriptedTriageRunner()

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(runner))
		testBed.override(InboundTriage, testBed.resolve(QuickModelInboundTriage))
	})
	beforeEach(async () => {
		await testBed.reset()
		runner.reset()
		driver = testBed.resolve(LibSqlDatabaseDriver)
		queue = new LibSqlCommandQueue(driver, new MockLoggingService())
		testBed.override(CommandQueue, queue)
		queue.stopPolling()
	})
	afterEach(async () => {
		await queue.close()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const mailbox = () => testBed.resolve(MailboxRepository)
	const cues = async () =>
		(await driver.db.select().from(scheduledCommands))
			.filter(row => row.name === 'react_to_channel_message')
			.map(row => (row.input as { reaction: string }).reaction)
	const triaged = async () => (await testBed.resolve(DomainEventRepository).findByType(MessageTriagedEvent)).map(event => event.payload)

	/** A conversation with one WORKING issue (APP-7) and one waiting on someone (APP-8). */
	const scene = async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const working = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-7', title: 'Página de preços' })
		const waiting = await givenIssue(testBed, {
			threadId: thread.id.value,
			key: 'APP-8',
			title: 'Relatório mensal',
			status: IssueStatus.NEEDS_INPUT,
		})
		return { thread, working, waiting }
	}

	const ingest = (threadId: string, text: string, extra: { messageType?: MessageType; quotedEntryId?: string } = {}) =>
		testBed.resolve(IngestChannelMessage).execute({
			threadId,
			senderExternalId: 'operator',
			text: `${GIVEN_MENTION_TAG} ${text}`,
			receivedAt: new Date(),
			platformMessageId: `wamid-${text.length}-${Math.random()}`,
			...extra,
		})

	/** Ingest + hand to the pool, the way `ConsumeInboundMessage` does, and wait for the pool to settle. */
	const send = async (threadId: string, text: string) => {
		const out = await ingest(threadId, text)
		const pool = testBed.resolve(InboundTriageQueue)
		if (out.triage) pool.submit(job(threadId, out.entryId))
		await pool.idle()
		return out
	}

	const job = (threadId: string, entryId: string) => ({
		threadId,
		entryId,
		run: () => testBed.resolve(TriageChannelMessage).execute({ threadId, entryId, platformMessageId: 'wamid-x' }),
	})

	const threadItem = async () => mailbox().claimNext('orchestrator-test', 60_000, [MailboxTargetKind.THREAD])
	const issueItem = async () => mailbox().claimNext('issue-test', 60_000, [MailboxTargetKind.ISSUE])

	it('holds the orchestrator item while the triage runs — the orchestrator cannot claim it', async () => {
		const { thread } = await scene()
		const out = await ingest(thread.id.value, 'deixa o botão azul')

		expect(out.triage).toBe(true)
		expect(await threadItem()).toBeUndefined()
		expect(await mailbox().isHeld(out.entryId, TRIAGE_HOLDER)).toBe(true)
	})

	it('STEER with confidence ≥ 0.8 goes to the issue: no orchestrator turn, entry linked, 👀 cue, measured', async () => {
		const { thread, working } = await scene()
		runner.scripts.set('deixa o botão azul', steer('APP-7'))

		const out = await send(thread.id.value, 'deixa o botão azul')

		expect(await threadItem()).toBeUndefined()
		expect(await mailbox().hasPending(MailboxTargetKind.THREAD, thread.id.value)).toBe(false)
		const item = await issueItem()
		expect(item?.kind).toBe(MailboxItemKind.STEER)
		expect(item?.targetId).toBe(working.id.value)
		// The PERSON's words, signed — not a paraphrase.
		expect((item?.payload as { text?: string } | undefined)?.text).toBe('operator: deixa o botão azul')
		const entry = await testBed.resolve(ThreadRepository).findEntry(out.entryId)
		expect(entry?.issueId).toBe(working.id.value)
		expect(entry?.classification).toBe(ClassificationMethod.CONTEXT_MATCH)
		expect(await cues()).toEqual([CUE_ACKNOWLEDGED])
		const [fact] = await triaged()
		expect(fact).toMatchObject({ decision: TriageDecision.STEER, applied: true, issueId: working.id.value, confidence: 0.95 })
		expect(fact?.latencyMs).toBeGreaterThanOrEqual(0)
	})

	it('a STEER below the floor goes to the orchestrator, with the verdict as a hint', async () => {
		const { thread } = await scene()
		runner.scripts.set('deixa o botão azul', steer('APP-7', 0.6))

		await send(thread.id.value, 'deixa o botão azul')

		expect(await issueItem()).toBeUndefined()
		const item = await threadItem()
		expect(item?.kind).toBe(MailboxItemKind.OPERATOR_MESSAGE)
		expect((item?.payload as { triage?: unknown } | undefined)?.triage).toMatchObject({
			decision: TriageDecision.ORCHESTRATOR,
			confidence: 0.6,
		})
		expect((await triaged())[0]).toMatchObject({
			decision: TriageDecision.ORCHESTRATOR,
			applied: true,
			fallback: 'low confidence for STEER',
		})
	})

	it('a STEER at an issue that is not WORKING (or not this conversation’s) goes to the orchestrator', async () => {
		const { thread } = await scene()
		runner.scripts.set('manda o relatório', steer('APP-8'))
		runner.scripts.set('e aquela outra', steer('ZZZ-1'))

		await send(thread.id.value, 'manda o relatório')
		await send(thread.id.value, 'e aquela outra')

		expect(await issueItem()).toBeUndefined()
		expect((await triaged()).map(fact => fact.decision)).toEqual([TriageDecision.ORCHESTRATOR, TriageDecision.ORCHESTRATOR])
	})

	it('NO_ACTION with high confidence records the entry only — no turn, ✅ in place of the 👀', async () => {
		const { thread } = await scene()
		runner.scripts.set('valeu', { confidence: 0.97, verdict: { decision: TriageDecision.NO_ACTION } })

		await send(thread.id.value, 'valeu')

		expect(await threadItem()).toBeUndefined()
		expect(await mailbox().hasPending(MailboxTargetKind.THREAD, thread.id.value)).toBe(false)
		expect(await cues()).toEqual([CUE_ACKNOWLEDGED, CUE_READ])
	})

	it('NO_ACTION below its stricter floor (0.9) goes to the orchestrator', async () => {
		const { thread } = await scene()
		runner.scripts.set('valeu', { confidence: 0.85, verdict: { decision: TriageDecision.NO_ACTION } })

		await send(thread.id.value, 'valeu')

		expect((await threadItem())?.kind).toBe(MailboxItemKind.OPERATOR_MESSAGE)
	})

	it('NEW_TASK goes to the orchestrator — which still opens it — with the suggested title', async () => {
		const { thread } = await scene()
		runner.scripts.set('cria uma landing', { confidence: 0.9, verdict: { decision: TriageDecision.NEW_TASK, title: 'Landing nova' } })

		await send(thread.id.value, 'cria uma landing')

		const item = await threadItem()
		expect((item?.payload as { triage?: unknown } | undefined)?.triage).toEqual({
			decision: TriageDecision.NEW_TASK,
			confidence: 0.9,
			title: 'Landing nova',
		})
	})

	it('a failed run and a timed-out run both go to the orchestrator — the timeout kills the run', async () => {
		const { thread } = await scene()
		runner.scripts.set('primeira', 'fail')
		runner.scripts.set('segunda', 'hang')

		await send(thread.id.value, 'primeira')
		await send(thread.id.value, 'segunda')

		expect(runner.aborted).toBe(1)
		const facts = await triaged()
		expect(facts.map(fact => fact.decision)).toEqual([TriageDecision.ORCHESTRATOR, TriageDecision.ORCHESTRATOR])
		expect(facts[0]?.fallback).toContain('provider exploded')
		expect(facts[1]?.fallback).toContain('timeout')
		// Both released: the orchestrator answers them in order.
		expect((await threadItem())?.kind).toBe(MailboxItemKind.OPERATOR_MESSAGE)
	})

	it('triages two messages CONCURRENTLY — both in flight before either finishes', async () => {
		const { thread } = await scene()
		runner.scripts.set('primeira', steer('APP-7'))
		runner.scripts.set('segunda', { confidence: 0.97, verdict: { decision: TriageDecision.NO_ACTION } })
		let release: () => void = () => {}
		runner.gate = new Promise(resolve => {
			release = resolve
		})

		const pool = testBed.resolve(InboundTriageQueue)
		const first = await ingest(thread.id.value, 'primeira')
		const second = await ingest(thread.id.value, 'segunda')
		pool.submit(job(thread.id.value, first.entryId))
		pool.submit(job(thread.id.value, second.entryId))
		// Let both reach the model.
		for (let i = 0; i < 50 && runner.inFlight < 2; i++) await new Promise(resolve => setTimeout(resolve, 5))

		expect(runner.inFlight).toBe(2)
		release()
		await pool.idle()
		expect(runner.maxInFlight).toBe(2)
		expect((await triaged()).map(fact => fact.decision).sort()).toEqual([TriageDecision.NO_ACTION, TriageDecision.STEER])
	})

	it('a crash mid-triage loses nothing: the boot sweep frees the hold, the orchestrator answers, the late verdict is dropped', async () => {
		const { thread } = await scene()
		const out = await ingest(thread.id.value, 'deixa o botão azul')
		// The daemon that held it is gone: another boot, a pid nobody holds.
		await driver.db
			.update(agentMailbox)
			.set({ claimedBoot: 'boot-that-died', claimedPid: 2_147_483_632 })
			.where(eq(agentMailbox.dedupKey, out.entryId))

		expect(await mailbox().releaseOrphanedClaims()).toBe(1)
		const item = await threadItem()
		expect(item?.kind).toBe(MailboxItemKind.OPERATOR_MESSAGE)

		// A triage that still ran (a redelivery, a slow pool) cannot take the message back.
		runner.scripts.set('deixa o botão azul', steer('APP-7'))
		const late = await testBed.resolve(TriageChannelMessage).execute({ threadId: thread.id.value, entryId: out.entryId })
		expect(late.applied).toBe(false)
		expect(runner.requests).toHaveLength(0)
		expect(await issueItem()).toBeUndefined()
	})

	it('a hold that lapsed and was claimed by the orchestrator drops the verdict (CAS on the holder)', async () => {
		const { thread } = await scene()
		const out = await ingest(thread.id.value, 'deixa o botão azul')
		await driver.db
			.update(agentMailbox)
			.set({ leaseUntil: new Date(Date.now() - 1) })
			.where(eq(agentMailbox.dedupKey, out.entryId))
		expect((await threadItem())?.kind).toBe(MailboxItemKind.OPERATOR_MESSAGE)

		expect(await mailbox().settleHold(out.entryId, TRIAGE_HOLDER, { consume: true })).toBe(false)
	})

	it('never triages what the rule layer routed, a media message, or a message that wakes nobody', async () => {
		const { thread } = await scene()

		const routed = await ingest(thread.id.value, 'APP-7 deixa o botão azul')
		const media = await ingest(thread.id.value, '[áudio]', { messageType: MessageType.AUDIO })
		const unaddressed = await testBed.resolve(IngestChannelMessage).execute({
			threadId: thread.id.value,
			senderExternalId: 'operator',
			text: 'conversa entre nós, sem marcar ninguém',
			receivedAt: new Date(),
		})

		expect([routed.triage, media.triage, unaddressed.triage]).toEqual([false, false, false])
		// The media message's item is not held: the orchestrator may claim it at once.
		expect((await threadItem())?.kind).toBe(MailboxItemKind.OPERATOR_MESSAGE)
	})

	it('the prompt carries the open issues and the tail, with names only — no phone, no JID', async () => {
		const jid = '5500900000001@s.whatsapp.net'
		const stranger = '5500900000002@s.whatsapp.net'
		const thread = await givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			participants: [
				{ participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true, canElevate: true },
				{ participantId: jid, name: 'Ana', source: 'Group member', canInvoke: true, canElevate: false },
			],
		})
		await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-7', title: 'Página de preços' })
		thread.recordEntry({ kind: TranscriptKind.CONTACT, text: 'alguém viu o deploy?', senderExternalId: stranger })
		thread.recordEntry({ kind: TranscriptKind.SYSTEM, text: 'Publiquei a prévia.' })
		await testBed.resolve(ThreadRepository).save(thread)
		runner.scripts.set('deixa o botão azul', steer('APP-7'))

		const out = await testBed.resolve(IngestChannelMessage).execute({
			threadId: thread.id.value,
			senderExternalId: jid,
			text: `${GIVEN_MENTION_TAG} deixa o botão azul`,
			receivedAt: new Date(),
		})
		expect(out.triage).toBe(true)
		await testBed.resolve(TriageChannelMessage).execute({ threadId: thread.id.value, entryId: out.entryId })

		const prompt = [runner.requests[0]?.systemPrompt, ...(runner.requests[0]?.messages.map(message => message.content) ?? [])].join('\n')
		expect(prompt).toContain('APP-7 [WORKING')
		expect(prompt).toContain('Página de preços')
		expect(prompt).toContain('participante: alguém viu o deploy?')
		expect(prompt).toContain('you: Publiquei a prévia.')
		expect(prompt).toContain('Ana: deixa o botão azul')
		expect(prompt).not.toContain('@s.whatsapp.net')
		expect(prompt).not.toContain('5500900000')
		expect(prompt).not.toContain(GIVEN_MENTION_TAG)
	})
})
