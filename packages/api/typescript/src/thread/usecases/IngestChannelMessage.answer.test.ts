import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { scheduledCommands } from '@codm/contracts/db'
import {
	BaseError,
	CommandQueue,
	DomainEventRepository,
	LibSqlCommandQueue,
	LibSqlDatabaseDriver,
	MockLoggingService,
} from '@codm/core-typescript'
import {
	AskAnswerKind,
	AskEffect,
	IssueStatus,
	MailboxTargetKind,
	StopKind,
	StopResolution,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenStop, givenThread, GIVEN_MENTION_TAG } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import type { Participant } from '../entities/Thread'
import type { AskStopKind } from '../objects/StopAsk'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { AnswerDisambiguationAskedEvent } from '../events/AnswerDisambiguationAskedEvent'
import { CUE_ACKNOWLEDGED } from '../utils/ChannelCues'
import { IngestChannelMessage } from './IngestChannelMessage'
import { AnswerStop } from './AnswerStop'

/**
 * RESPONDER (fase 3, item 3) — an ask is answered in the group by quoting it, by its code, or by a bare
 * "sim" when it is the only one pending for that person; the ruler of who may answer holds; a late reply
 * resolves nothing again; a bare "sim" with several pending asks gets ONE "which one?".
 *
 * Falsifier: drop the `answer` call from `IngestChannelMessage` and every "resolves" test finds the stop open
 * and an orchestrator turn queued; run it AFTER `control()` and the "segue quoting a question" test pauses
 * nothing but resumes nothing either — the answer is lost to the control word.
 */
describe('IngestChannelMessage — answering an ask in the group', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let queue: LibSqlCommandQueue
	let driver: LibSqlDatabaseDriver

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
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

	const MEMBER = 'member-a'
	const MUTED = 'member-muted'
	const roster: Participant[] = [
		{ participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true, canElevate: true },
		{ participantId: MEMBER, name: 'Member A', source: 'Group member', canInvoke: true, canElevate: false },
		{ participantId: MUTED, name: 'Member M', source: 'Group member', canInvoke: false, canElevate: false },
	]
	const YES_NO = [
		{ id: 'yes', label: 'Sim' },
		{ id: 'no', label: 'Não' },
	]

	const commandsNamed = async (name: string) => (await driver.db.select().from(scheduledCommands)).filter(row => row.name === name)
	const cues = async () => (await commandsNamed('react_to_channel_message')).map(row => (row.input as { reaction: string }).reaction)
	const stopOf = (stopId: string) => testBed.resolve(ThreadRepository).findStop(stopId)
	const threadTurn = () => testBed.resolve(MailboxRepository).hasPending(MailboxTargetKind.THREAD, threadId)

	let threadId = ''
	/** A group with one issue (`APP-12`, waiting on its ask). */
	const scene = async (status: IssueStatus = IssueStatus.NEEDS_INPUT) => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, participants: roster })
		threadId = thread.id.value
		const issue = await givenIssue(testBed, { threadId, key: 'APP-12', status })
		return { thread, issue }
	}
	const ask = (
		issueId: string,
		overrides: { question?: string; options?: typeof YES_NO; effects?: AskEffect[]; requested?: AskStopKind } = {},
	) =>
		givenStop(testBed, {
			threadId,
			issueId,
			notice: `APP-12 · D? — ${overrides.question ?? 'Uso o tema escuro?'}`,
			ask: {
				question: overrides.question ?? 'Uso o tema escuro?',
				options: overrides.options ?? YES_NO,
				effects: overrides.effects ?? [],
				requested: overrides.requested ?? StopKind.DECISION_REQUESTED,
			},
		})
	const say = (text: string, opts: { from?: string; quoting?: string } = {}) =>
		testBed.resolve(IngestChannelMessage).execute({
			threadId,
			senderExternalId: opts.from ?? MEMBER,
			text,
			quotedEntryId: opts.quoting,
			receivedAt: new Date(),
			platformMessageId: `wamid-${Math.random()}`,
		})

	it('a quoted reply answers THAT ask — option by number, no orchestrator turn, 👀, entry on the issue', async () => {
		const { issue } = await scene()
		const stop = await ask(issue.id.value)

		const out = await say('2', { quoting: stop.askEntryId })

		const answered = await stopOf(stop.stopId)
		expect(answered?.resolution).toBe(StopResolution.ANSWER)
		expect(answered?.answer).toEqual({ kind: AskAnswerKind.OPTION, optionId: 'no' })
		expect(answered?.answeredBy).toBe(MEMBER)
		expect(out.invocable).toBe(false)
		expect(await threadTurn()).toBe(false)
		expect(await cues()).toEqual([CUE_ACKNOWLEDGED])
		const entry = await testBed.resolve(ThreadRepository).findEntry(out.entryId)
		expect(entry?.issueId).toBe(issue.id.value)
	})

	it('"segue" quoting a question is an ANSWER (free text), not the RESUME control word', async () => {
		const { issue } = await scene()
		const stop = await ask(issue.id.value, { options: [], requested: StopKind.DECISION_REQUESTED })

		await say('segue', { quoting: stop.askEntryId })

		expect((await stopOf(stop.stopId))?.answer).toEqual({ kind: AskAnswerKind.TEXT, text: 'segue' })
	})

	it('the code in the text answers without a quote — and needs no mention (`APP-12 · D1 sim`)', async () => {
		const { issue } = await scene()
		const stop = await ask(issue.id.value)

		await say('APP-12 · D1 sim')

		expect((await stopOf(stop.stopId))?.answer).toEqual({ kind: AskAnswerKind.OPTION, optionId: 'yes' })
	})

	it('a bare "sim" addressed to the agent answers the ONE pending yes/no ask', async () => {
		const { issue } = await scene()
		const stop = await ask(issue.id.value)

		await say(`${GIVEN_MENTION_TAG} sim`)

		expect((await stopOf(stop.stopId))?.answer).toEqual({ kind: AskAnswerKind.OPTION, optionId: 'yes' })
	})

	it('NEGATIVE — a bare "sim" never answers a QUESTION still waiting for its digest (nobody saw it yet)', async () => {
		const { issue } = await scene()
		const waiting = await givenStop(testBed, {
			threadId,
			issueId: issue.id.value,
			notice: 'APP-12 · D1 — Uso o tema escuro?',
			ask: {
				question: 'Uso o tema escuro?',
				options: YES_NO,
				default: { kind: AskAnswerKind.OPTION, optionId: 'yes' },
				effects: [],
				requested: StopKind.QUESTION_ASKED,
			},
		})

		await say(`${GIVEN_MENTION_TAG} sim`)
		expect((await stopOf(waiting.stopId))?.resolvedAt).toBeUndefined()

		// Delivered (its clock started), the same "sim" answers it.
		await testBed.resolve(ThreadRepository).markAskDelivered(waiting.askEntryId ?? '', new Date())
		await say(`${GIVEN_MENTION_TAG} sim`)
		expect((await stopOf(waiting.stopId))?.answer).toEqual({ kind: AskAnswerKind.OPTION, optionId: 'yes' })
	})

	it('NEGATIVE — an unaddressed "sim" in a gated group answers nothing', async () => {
		const { issue } = await scene()
		const stop = await ask(issue.id.value)

		await say('sim')

		expect((await stopOf(stop.stopId))?.resolvedAt).toBeUndefined()
	})

	it('a bare "sim" with TWO pending asks gets ONE "which one?"; a second within 10 min goes to the orchestrator', async () => {
		const { issue } = await scene()
		const first = await ask(issue.id.value, { question: 'Uso o tema escuro?' })
		const second = await ask(issue.id.value, { question: 'Mando o resumo hoje?' })

		await say(`${GIVEN_MENTION_TAG} sim`)

		expect((await stopOf(first.stopId))?.resolvedAt).toBeUndefined()
		expect((await stopOf(second.stopId))?.resolvedAt).toBeUndefined()
		const asked = await commandsNamed('deliver_channel_message')
		expect(asked).toHaveLength(1)
		const question = (asked[0]?.input as { text?: string } | undefined)?.text ?? ''
		// Each question named by its task and its words — no ask code (voz do grupo, 25/11).
		expect(question).toContain('Tenho 2 perguntas abertas:')
		expect(question).not.toMatch(/\bD\d\b/u)
		expect(await testBed.resolve(DomainEventRepository).findByType(AnswerDisambiguationAskedEvent)).toHaveLength(1)
		expect(await threadTurn()).toBe(false)

		await say(`${GIVEN_MENTION_TAG} sim`)

		expect(await commandsNamed('deliver_channel_message')).toHaveLength(1)
		expect(await threadTurn()).toBe(true)
	})

	it('who may not release does NOT approve a publication — the ask stays open, the message goes on', async () => {
		const { issue } = await scene()
		const stop = await ask(issue.id.value, { question: 'Publico a página?', effects: [AskEffect.PUBLISH] })

		await say('sim', { quoting: stop.askEntryId })

		expect((await stopOf(stop.stopId))?.resolvedAt).toBeUndefined()

		await say('sim', { quoting: stop.askEntryId, from: 'operator' })

		expect((await stopOf(stop.stopId))?.answeredBy).toBe('operator')
	})

	it('a muted participant answers nothing, even a question without effect', async () => {
		const { issue } = await scene()
		const stop = await ask(issue.id.value)

		await say('sim', { quoting: stop.askEntryId, from: MUTED })

		expect((await stopOf(stop.stopId))?.resolvedAt).toBeUndefined()
	})

	it('a LATE reply (already answered) resolves nothing again — it becomes a steer of the issue at work', async () => {
		// The issue went back to work once answered (the resume) — that is when a late reply lands.
		const { issue } = await scene(IssueStatus.WORKING)
		const stop = await ask(issue.id.value)
		await say('1', { quoting: stop.askEntryId })

		const late = await say('2', { quoting: stop.askEntryId, from: 'operator' })

		const answered = await stopOf(stop.stopId)
		expect(answered?.answer).toEqual({ kind: AskAnswerKind.OPTION, optionId: 'yes' })
		expect(answered?.answeredBy).toBe(MEMBER)
		// The usual path of a quote of the issue's message: recorded on the issue, straight to its session.
		expect((await testBed.resolve(ThreadRepository).findEntry(late.entryId))?.issueId).toBe(issue.id.value)
		expect(await testBed.resolve(MailboxRepository).hasPending(MailboxTargetKind.ISSUE, issue.id.value)).toBe(true)
		expect(await threadTurn()).toBe(false)
	})

	it("a stop of the CONVERSATION (no issue) is not answered by a rule — the orchestrator's path stays", async () => {
		await scene()
		const stop = await givenStop(testBed, { threadId, kind: StopKind.PERMISSION_DENIED })

		await say(`${GIVEN_MENTION_TAG} sim`, { from: 'operator' })

		expect((await stopOf(stop.stopId))?.resolvedAt).toBeUndefined()
		expect(await threadTurn()).toBe(true)
	})

	it('first answer wins across doors — the console after the group gets STOP_ALREADY_RESOLVED', async () => {
		const { issue } = await scene()
		const stop = await ask(issue.id.value)
		await say('1', { quoting: stop.askEntryId })

		const loser = testBed.resolve(AnswerStop).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			stopId: stop.stopId,
			answer: { kind: AskAnswerKind.OPTION, optionId: 'no' },
			answeredBy: 'operator',
		})

		await expect(loser).rejects.toBeInstanceOf(BaseError)
		await expect(loser).rejects.toMatchObject({ name: 'STOP_ALREADY_RESOLVED' })
		expect((await stopOf(stop.stopId))?.answer).toEqual({ kind: AskAnswerKind.OPTION, optionId: 'yes' })
	})

	it('a permission (PERMISSION_DENIED) is approved by a quoted "sim" from who may release', async () => {
		const { issue } = await scene()
		const stop = await givenStop(testBed, {
			threadId,
			issueId: issue.id.value,
			kind: StopKind.PERMISSION_DENIED,
			notice: 'APP-12 — precisa de permissão',
		})
		const entryId = (await testBed.resolve(ThreadRepository).listEntries(threadId)).find(e => e.stopId === stop.stopId)?.entryId

		await say('sim', { quoting: entryId })
		expect((await stopOf(stop.stopId))?.resolvedAt).toBeUndefined()

		await say('sim', { quoting: entryId, from: 'operator' })
		expect((await stopOf(stop.stopId))?.resolution).toBe(StopResolution.APPROVE)
	})

	it('a quote of a BLOCK NOTICE is talk about it, never its resolution', async () => {
		const { issue } = await scene()
		const stop = await givenStop(testBed, { threadId, issueId: issue.id.value, kind: StopKind.SERVER_ERROR, notice: 'APP-12 — erro' })
		const entryId = (await testBed.resolve(ThreadRepository).listEntries(threadId)).find(e => e.stopId === stop.stopId)?.entryId

		await say('sim', { quoting: entryId, from: 'operator' })

		expect((await stopOf(stop.stopId))?.resolvedAt).toBeUndefined()
		expect((await testBed.resolve(ThreadRepository).listEntries(threadId)).some(e => e.kind === TranscriptKind.CONTACT)).toBe(true)
	})
})
