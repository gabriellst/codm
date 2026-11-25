import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ZodType } from 'zod'
import {
	CommandQueue,
	DomainEventRepository,
	EventEmitter2Mediator,
	type Handler,
	LibSqlCommandQueue,
	LibSqlDatabaseDriver,
	MockLoggingService,
	OutboxDispatcher,
} from '@codm/core-typescript'
import {
	ArtifactKind,
	AskAnswerKind,
	AskEffect,
	GroupOutputMode,
	IssueSignalLevel,
	IssueStatus,
	Language,
	MailboxTargetKind,
	OutputRouting,
	PermissionPosture,
	StopResolution,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed, GIVEN_MENTION_TAG, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { AgentName, AgentRunOutcome } from '@agent/enums'
import { AgentRunner } from '@agent/services/AgentRunner'
import { AgentRunnerFactory, FixedAgentRunnerFactory } from '@agent/services/AgentRunnerFactory'
import { MailboxDispatcher } from '@agent/services/MailboxDispatcher'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import type { AgentRunRequest } from '@agent/types/AgentRunRequest'
import type { AgentRuntimeEvent } from '@agent/types/AgentRuntimeEvent'
import { ForkIssue } from '@agent/usecases/ForkIssue'
import { RequestFeedback } from '@agent/usecases/RequestFeedback'
import { AskDecision } from '@agent/usecases/AskDecision'
import { AskQuestion } from '@agent/usecases/AskQuestion'
import { DeclareIssueComplete } from '@agent/usecases/DeclareIssueComplete'
import { PublishAgentIntegrationEvents } from '@agent/handlers/PublishAgentIntegrationEvents'
import { RecordArtifact } from '@artifact/usecases/RecordArtifact'
import { PublishArtifactIntegrationEvents } from '@artifact/handlers/PublishArtifactIntegrationEvents'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { MarkIssueNeedsInputFromStop, MaterializeIssueFromExecution } from '@issue/handlers/external'
import { AbortIssueTurnOnPause, PublishIssueIntegrationEvents, ReleaseIssueWorkOnResume } from '@issue/handlers/internal'
import { CloseIssueOnChannel, DeliverOrchestratorReply, RecordStopFromExecution, RouteIssueSignal } from '@thread/handlers/external'
import { InterruptIssueTurnOnSteer, PublishThreadIntegrationEvents, ResumeIssueOnStopResolved } from '@thread/handlers/internal'
import type { Participant } from '@thread/entities/Thread'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { ChannelSender, MockChannelSender } from '@thread/services/ChannelSender'
import { ChannelConnectivity, MockChannelConnectivity } from '@thread/services/ChannelConnectivity'
import { BulletinSentEvent } from '@thread/events/BulletinSentEvent'
import { ApplyDueQuestionDefaults } from '@thread/usecases/ApplyDueQuestionDefaults'
import { DeliverChannelAttachment } from '@thread/usecases/DeliverChannelAttachment'
import { DeliverChannelMessage } from '@thread/usecases/DeliverChannelMessage'
import { DeliverIssuePreview } from '@thread/usecases/DeliverIssuePreview'
import { FlushOverdueDigests } from '@thread/usecases/FlushOverdueDigests'
import { IngestChannelMessage } from '@thread/usecases/IngestChannelMessage'
import { ReactToChannelMessage } from '@thread/usecases/ReactToChannelMessage'

/** What a scripted session does on one turn — its tool calls — and the words it ends the turn with. */
type Turn = (request: AgentRunRequest<ZodType | undefined>) => Promise<string>

/**
 * A runner that plays a SCRIPT: one entry per turn, per agent. The tool calls are the real use cases behind
 * the MCP tools (the HTTP hop is the only thing skipped), so every fact they write goes through the real
 * outbox, bridges and handlers. A turn nobody scripted fails the test — a wake the task should not cause.
 */
class ScriptedRunner extends AgentRunner {
	readonly turns: Record<AgentName.ORCHESTRATOR | AgentName.ISSUE_WORK, Turn[]> = {
		[AgentName.ORCHESTRATOR]: [],
		[AgentName.ISSUE_WORK]: [],
	}
	readonly ran: { agent: AgentName; prompt: string }[] = []
	/**
	 * What happens while a real session spawns (seconds): the daemon keeps draining the outbox. Without it the
	 * issue's first tool call could run before the fork that created the issue was materialized — a race the
	 * spawn time makes impossible in production, and a scripted turn (no spawn) would make constant here.
	 */
	beforeTurn: () => Promise<void> = async () => {}

	async *run<OutputSchema extends ZodType | undefined = undefined>(
		request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent> {
		const agent = request.agentName
		this.ran.push({ agent, prompt: request.messages.map(message => message.content).join('\n') })
		const script = agent === AgentName.ORCHESTRATOR || agent === AgentName.ISSUE_WORK ? this.turns[agent] : []
		const turn = script.shift()
		if (!turn) throw new Error(`unscripted ${agent} turn — the task woke an agent it should not have`)
		await this.beforeTurn()
		const replyText = await turn(request as AgentRunRequest<ZodType | undefined>)
		yield { type: 'finished', result: { outcome: AgentRunOutcome.COMPLETED, replyText, sessionId: `scripted-${agent}`, failed: false } }
	}

	async shutdown(): Promise<void> {}
}

/**
 * ACEITE DA FASE 3 (spec 2026-11-17, "Critério de aceite"): a typical task — request → preview → approval →
 * live — puts in the group AT MOST the receipt, the feedback, the decision and the closing; progress never goes
 * to the group under the default mode; a level-2 question goes on by itself 15 min after the group saw it; and
 * `boletim` is answered without a model turn (revisão 25/11: `relatorio` is the orchestrator's again).
 *
 * Integration mode, everything real except the model: the request enters through `IngestChannelMessage`, the
 * mailbox dispatcher runs the turns on a scripted runner whose "tool calls" are the use cases behind the MCP
 * tools, the outbox carries the facts to the bridges, the integration events reach the handlers that consume
 * them in the daemon, and the commands the handlers queue are EXECUTED — the group is what `MockChannelSender`
 * actually sent. The clocks that matter (the 60 s digest window, the 15 min default) are handed in.
 *
 * What is counted is what reaches the WIRE: a text or a media message is one message; a reaction (👀/☑️/✅)
 * is not a message.
 */
describe('Flow (integration): fase 3 — a typical task in the group', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let queue: LibSqlCommandQueue
	let sender: MockChannelSender
	let runner: ScriptedRunner
	let external: EventEmitter2Mediator
	let externalCursor = 0
	let scratch: string

	const REQUESTER = 'member-a'
	const roster: Participant[] = [
		{ participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true, canElevate: true },
		// Asks for the work and may release it: a decision to PUBLISH needs someone who may.
		{ participantId: REQUESTER, name: 'Member A', source: 'Group member', canInvoke: true, canElevate: true },
	]

	beforeAll(() => {
		scratch = mkdtempSync(join(tmpdir(), 'fase3-flow-'))
	})
	beforeEach(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		await testBed.reset()
		externalCursor = 0

		sender = new MockChannelSender()
		testBed.override(ChannelSender, sender)
		// The channel has been connected for a long time — the 15 min default is not held by the grace.
		testBed.override(ChannelConnectivity, new MockChannelConnectivity())
		runner = new ScriptedRunner()
		runner.beforeTurn = async () => {
			await deliverFacts()
		}
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(runner))

		// Commands run when this test ticks the queue, never on a timer.
		queue = new LibSqlCommandQueue(testBed.resolve(LibSqlDatabaseDriver), new MockLoggingService())
		testBed.override(CommandQueue, queue)
		const commands: Handler[] = [
			testBed.resolve(DeliverChannelMessage),
			testBed.resolve(DeliverIssuePreview),
			testBed.resolve(DeliverChannelAttachment),
			testBed.resolve(ReactToChannelMessage),
		]
		for (const command of commands) await queue.registerCommandHandler(command)
		queue.stopPolling()

		// The daemon's wiring (`BoundedContext.create`), for the contexts this flow crosses: domain facts reach the
		// internal handlers through the outbox; integration events reach their consumers from the external lane.
		const internal: Handler[] = [
			testBed.resolve(PublishAgentIntegrationEvents),
			testBed.resolve(PublishThreadIntegrationEvents),
			testBed.resolve(PublishIssueIntegrationEvents),
			testBed.resolve(PublishArtifactIntegrationEvents),
			testBed.resolve(ResumeIssueOnStopResolved),
			testBed.resolve(InterruptIssueTurnOnSteer),
			testBed.resolve(AbortIssueTurnOnPause),
			testBed.resolve(ReleaseIssueWorkOnResume),
		]
		for (const handler of internal) await testBed.spy.register(handler)
		external = new EventEmitter2Mediator()
		const consumers: Handler[] = [
			testBed.resolve(DeliverOrchestratorReply),
			testBed.resolve(RecordStopFromExecution),
			testBed.resolve(RouteIssueSignal),
			testBed.resolve(CloseIssueOnChannel),
			testBed.resolve(MaterializeIssueFromExecution),
			testBed.resolve(MarkIssueNeedsInputFromStop),
		]
		for (const handler of consumers) await external.register(handler)
	})
	afterEach(async () => {
		await queue.close()
	})
	afterAll(async () => {
		await testBed.destroy()
		rmSync(scratch, { recursive: true, force: true })
	})

	/**
	 * Let the daemon run until nothing moves: the outbox, the integration lane (in order, one event after the
	 * other — as `SqlExternalMediator` delivers), the due commands and the mailbox. `windowElapsed` also closes
	 * the per-person digest windows (the 60 s the group's feedback and questions wait in).
	 */
	async function deliverFacts(): Promise<number> {
		await testBed.resolve(OutboxDispatcher).flush()
		const published = testBed.externalSpy.getPublished().slice(externalCursor)
		externalCursor += published.length
		for (const event of published) await external.dispatch(event)
		return published.length
	}
	async function settle(opts: { windowElapsed?: boolean } = {}) {
		for (let round = 0; round < 12; round++) {
			const published = { length: await deliverFacts() }
			if (opts.windowElapsed) await testBed.resolve(FlushOverdueDigests).execute({ now: new Date(Date.now() + 5 * 60 * 1000) })
			await queue.tick()
			const turns = await testBed.resolve(MailboxDispatcher).bind(testContainer).drain()
			if (published.length === 0 && turns === 0 && round > 2) return
		}
	}

	/** Every message the group received — text or media; reactions are not messages. */
	const groupMessages = () => [...sender.sent.map(m => m.text), ...sender.sentMedia.map(m => m.caption ?? '')]
	const orchestratorWakes = () => runner.ran.filter(run => run.agent === AgentName.ORCHESTRATOR).length
	const thread = (threadId: string) => testBed.resolve(ThreadRepository).findById(threadId)
	/** Every mailbox item ever queued, consumed ones included — every turn the task scheduled. */
	const mailboxItems = () => testBed.probe().count('agentMailbox')
	const entries = (threadId: string) => testBed.resolve(ThreadRepository).listEntries(threadId)

	async function scene() {
		const t = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, participants: roster })
		t.configureLanguage(Language.PT_BR)
		await testBed.resolve(ThreadRepository).save(t)
		return t.id.value
	}
	const say = (threadId: string, text: string, opts: { quoting?: string } = {}) =>
		testBed.resolve(IngestChannelMessage).execute({
			threadId,
			senderExternalId: REQUESTER,
			text,
			quotedEntryId: opts.quoting,
			receivedAt: new Date(),
			platformMessageId: `platform-${Math.random()}`,
		})

	/** The orchestrator forks the issue the person asked for and answers with the receipt. */
	function scriptReceipt(threadId: string, requestEntryId: () => string, onFork: (issue: { issueId: string; key: string }) => void) {
		runner.turns[AgentName.ORCHESTRATOR].push(async () => {
			const forked = await testBed.resolve(ForkIssue).execute({
				ownerId: MOCK_CLOUD_OWNER_ID,
				threadId,
				goal: 'Fazer a página nova da promoção e publicar.',
				title: 'Página da promoção',
				originEntryId: requestEntryId(),
				posture: PermissionPosture.AUTO,
			})
			onFork(forked)
			return `Abri ${forked.key} · Página da promoção — aviso aqui quando tiver prévia.`
		})
	}

	it('request → preview → approval → live: the group gets the receipt, the feedback, the decision and the closing — nothing else', async () => {
		const threadId = await scene()
		let issue = { issueId: '', key: '' }
		let requestEntryId = ''
		const print = join(scratch, 'previa.png')
		writeFileSync(print, 'png')
		const live = join(scratch, 'no-ar.png')
		writeFileSync(live, 'png')

		scriptReceipt(
			threadId,
			() => requestEntryId,
			forked => {
				issue = forked
			},
		)
		// Turn 1 of the issue: records the preview, asks for feedback, asks to publish (effect PUBLISH), ends
		// with prose — the prose is PROGRESS.
		runner.turns[AgentName.ISSUE_WORK].push(async () => {
			const tool = { ownerId: MOCK_CLOUD_OWNER_ID, threadId, issueId: issue.issueId, actingIssueId: issue.issueId }
			const { artifactId } = await testBed.resolve(RecordArtifact).execute({
				ownerId: MOCK_CLOUD_OWNER_ID,
				threadId,
				issueId: issue.issueId,
				kind: ArtifactKind.IMAGE,
				name: 'previa.png',
				ref: print,
				meta: '',
			})
			await testBed
				.resolve(RequestFeedback)
				.execute({ ...tool, text: 'Prévia da página no ambiente de teste.', mainArtifactId: artifactId, artifactIds: [artifactId] })
			await testBed.resolve(AskDecision).execute({
				...tool,
				question: 'Posso publicar a página?',
				options: [
					{ id: 'yes', label: 'Publicar' },
					{ id: 'no', label: 'Ainda não' },
				],
				effects: [AskEffect.PUBLISH],
			})
			return 'Montei a página, subi no ambiente de teste e tirei o print. Esperando a decisão de publicar.'
		})
		// Turn 2, resumed by the answer: publishes, declares the task done with the print of what went live.
		runner.turns[AgentName.ISSUE_WORK].push(async () => {
			const { artifactId } = await testBed.resolve(RecordArtifact).execute({
				ownerId: MOCK_CLOUD_OWNER_ID,
				threadId,
				issueId: issue.issueId,
				kind: ArtifactKind.IMAGE,
				name: 'no-ar.png',
				ref: live,
				meta: '',
			})
			await testBed.resolve(DeclareIssueComplete).execute({
				ownerId: MOCK_CLOUD_OWNER_ID,
				threadId,
				issueId: issue.issueId,
				status: IssueStatus.COMPLETED,
				summary: 'Página publicada.',
				key: issue.key,
				finalArtifactId: artifactId,
			})
			return 'Publiquei e conferi em produção.'
		})

		// 1. The request.
		const asked = await say(threadId, `${GIVEN_MENTION_TAG} faz a página nova da promoção e publica`)
		requestEntryId = asked.entryId
		await settle({ windowElapsed: true })
		expect(issue.key).not.toBe('')
		const stops = await testBed.resolve(ThreadRepository).openStopsByIssue(issue.issueId)
		expect(stops).toHaveLength(1)
		const decision = stops[0]
		expect(decision?.askEntryId).toBeDefined()

		// 2. The person approves by quoting the decision.
		await say(threadId, '1', { quoting: decision?.askEntryId })
		await settle({ windowElapsed: true })

		// THE TASK FINISHED — through the declared completion, not the end of a turn.
		const finished = await testBed.resolve(IssueRepository).findById(issue.issueId)
		expect(finished?.status).toBe(IssueStatus.COMPLETED)
		expect((await testBed.resolve(ThreadRepository).findStop(decision?.stopId ?? ''))?.resolution).toBe(StopResolution.ANSWER)

		// THE ACCEPTANCE CRITERION, under the DEFAULT mode: four messages — receipt, feedback, decision, closing.
		expect((await thread(threadId))?.outputMode).toBe(GroupOutputMode.DECISIONS_AND_LIVE)
		const said = groupMessages()
		expect(said).toHaveLength(4)
		// The receipt is ONE message: the orchestrator's placeholder ("✻ …"), edited into the reply when it lands.
		expect(sender.sent.map(m => m.text)).toEqual([expect.stringContaining('✻'), expect.stringContaining('Posso publicar a página?')])
		expect(sender.edits.at(-1)?.text).toContain('Abri ')
		expect(sender.sentMedia.map(m => m.caption)).toEqual([
			expect.stringContaining('Prévia da página no ambiente de teste.'),
			expect.stringContaining('Página publicada.'),
		])
		// Each of the issue's three went out by the policy, as its own message.
		const levels = (await entries(threadId)).filter(e => e.issueId === issue.issueId && e.level).map(e => [e.level, e.routing])
		expect(levels).toContainEqual([IssueSignalLevel.FEEDBACK, OutputRouting.GROUP])
		expect(levels).toContainEqual([IssueSignalLevel.DECISION, OutputRouting.GROUP])
		expect(levels).toContainEqual([IssueSignalLevel.CLOSING, OutputRouting.GROUP])

		// PROGRESS EXISTS — and stayed on the panel (not vacuous: both turns ended with prose).
		const progress = (await entries(threadId)).filter(e => e.level === IssueSignalLevel.PROGRESS)
		expect(progress.length).toBeGreaterThanOrEqual(2)
		expect(progress.every(e => e.routing === OutputRouting.PANEL)).toBe(true)
		for (const line of progress) expect(said.some(text => text.includes(line.text))).toBe(false)

		// THE ORCHESTRATOR WOKE ONCE for the whole task — for the request. No ISSUE_RESULT was ever queued.
		expect(orchestratorWakes()).toBe(1)
		expect(runner.ran.filter(run => run.agent === AgentName.ISSUE_WORK)).toHaveLength(2)
		// Every turn the task scheduled: the request (THREAD), the issue's work, the resume the answer queued.
		// A third ISSUE item or any ISSUE_RESULT would make it more — and the unscripted wake would fail the run.
		expect(await mailboxItems()).toBe(3)
	})

	it('a level-2 question goes on with its default 15 min after the group saw it — no answer, no message more', async () => {
		const threadId = await scene()
		let issue = { issueId: '', key: '' }
		let requestEntryId = ''

		scriptReceipt(
			threadId,
			() => requestEntryId,
			forked => {
				issue = forked
			},
		)
		runner.turns[AgentName.ISSUE_WORK].push(async () => {
			await testBed.resolve(AskQuestion).execute({
				ownerId: MOCK_CLOUD_OWNER_ID,
				threadId,
				issueId: issue.issueId,
				actingIssueId: issue.issueId,
				question: 'Uso o azul da marca no botão?',
				options: [
					{ id: 'blue', label: 'Azul' },
					{ id: 'green', label: 'Verde' },
				],
				default: { kind: AskAnswerKind.OPTION, optionId: 'blue' },
				effects: [],
			})
			return 'Perguntei a cor do botão; sigo com azul se ninguém responder.'
		})
		// The turn the default resumes: it is told what was asked and that nobody answered.
		let resumedWith = ''
		runner.turns[AgentName.ISSUE_WORK].push(async request => {
			resumedWith = request.messages.map(message => message.content).join('\n')
			return 'Segui com azul.'
		})

		const asked = await say(threadId, `${GIVEN_MENTION_TAG} faz a página nova da promoção`)
		requestEntryId = asked.entryId
		await settle({ windowElapsed: true })

		// The question reached the group (its digest window closed with it alone) — the clock started there.
		const [question] = await testBed.resolve(ThreadRepository).openStopsByIssue(issue.issueId)
		expect(question?.dueAt).toBeDefined()
		const dueAt = question?.dueAt ?? new Date()
		const before = groupMessages().length

		// A minute short: nothing. At the deadline: the default, by itself.
		const sweep = (now: Date) => testBed.resolve(ApplyDueQuestionDefaults).execute({ now })
		expect((await sweep(new Date(dueAt.getTime() - 60 * 1000))).appliedStopIds).toEqual([])
		expect((await sweep(dueAt)).appliedStopIds).toEqual([question?.stopId ?? ''])
		await settle()

		const applied = await testBed.resolve(ThreadRepository).findStop(question?.stopId ?? '')
		expect(applied?.resolution).toBe(StopResolution.DEFAULT_APPLIED)
		expect(resumedWith).toContain('Uso o azul da marca no botão?')
		// The group heard the question once, and nothing about the default.
		expect(groupMessages()).toHaveLength(before)
		expect(groupMessages().filter(text => text.includes('Uso o azul da marca no botão?'))).toHaveLength(1)
		expect(orchestratorWakes()).toBe(1)
	})

	it('"boletim" is answered from the board — no orchestrator turn, one message', async () => {
		const threadId = await scene()

		const out = await say(threadId, `${GIVEN_MENTION_TAG} boletim`)
		expect(await testBed.resolve(DomainEventRepository).findByType(BulletinSentEvent)).toHaveLength(1)
		await settle()

		expect(out.invocable).toBe(false)
		expect(orchestratorWakes()).toBe(0)
		expect(await testBed.resolve(MailboxRepository).hasPending(MailboxTargetKind.THREAD, threadId)).toBe(false)
		expect(await mailboxItems()).toBe(0)
		expect(groupMessages()).toEqual([expect.stringContaining('Boletim')])
	})
})
