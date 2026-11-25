import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { eq } from 'drizzle-orm'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LibSqlDatabaseDriver } from '@codm/core-typescript'
import { scheduledCommands } from '@codm/contracts/db'
import {
	AskAnswerKind,
	AskEffect,
	ArtifactKind,
	GroupOutputMode,
	IssueSignalLevel,
	Language,
	OutputRouting,
	StopKind,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import { ThreadIssueSignalEvent } from '@codm/contracts-typescript/wire/events'
import { TestBed, givenArtifact, givenIssue, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { RouteIssueSignal } from '../handlers/RouteIssueSignal'
import { DeliverIssueSignal } from './DeliverIssueSignal'
import { DeliverIssuePreview } from './DeliverIssuePreview'
import { FlushSignalDigest } from './FlushSignalDigest'
import { FlushOverdueDigests } from './FlushOverdueDigests'
import { RaiseStop } from './RaiseStop'
import { ROUTING_BY_MODE } from '../utils/OutputPolicy'

/**
 * The per-person digest (fase 3, item 2) and the FEEDBACK's preview. A question and a feedback for the same
 * person within 60 s leave as ONE message; a lone one leaves as itself (a feedback with its print); a
 * decision never waits; progress stays on the panel in the default mode.
 *
 * The flush is a command (`flush_signal_digest`) the policy schedules a window later — here it is called
 * directly, as the queue would after the window, and the assertions read the durable command rows.
 *
 * THE DRAIN (voz do grupo, 25/11): the policy no longer routes anything to a digest, but signals the fase 3
 * policy queued before the update still have to leave. These tests put the fase 3 routing back (questions and
 * previews to the digest) for their own duration — the state a daemon finds the queue in right after updating.
 */
describe('FlushSignalDigest — one message per person', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let scratch: string

	const PERSON = 'participant-a'

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		scratch = mkdtempSync(join(tmpdir(), 'signal-digest-'))
	})
	const FASE3_DIGESTED = [IssueSignalLevel.QUESTION, IssueSignalLevel.FEEDBACK] as const
	const DIGEST_MODES = [GroupOutputMode.DECISIONS_AND_LIVE, GroupOutputMode.EVERYTHING] as const
	beforeEach(async () => {
		await testBed.reset()
		for (const mode of DIGEST_MODES) for (const level of FASE3_DIGESTED) ROUTING_BY_MODE[mode][level] = OutputRouting.DIGEST
	})
	afterEach(() => {
		for (const mode of DIGEST_MODES) for (const level of FASE3_DIGESTED) ROUTING_BY_MODE[mode][level] = OutputRouting.GROUP
	})
	afterAll(async () => {
		await testBed.destroy()
		rmSync(scratch, { recursive: true, force: true })
	})

	async function setUp(mode = GroupOutputMode.DECISIONS_AND_LIVE) {
		const thread = await givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			participants: [
				{ participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true, canElevate: true },
				{ participantId: PERSON, name: 'Pessoa A', source: 'Channel contact', canInvoke: true, canElevate: false },
			],
		})
		thread.configureOutputMode(mode)
		thread.configureLanguage(Language.PT_BR)
		await testBed.resolve(ThreadRepository).save(thread)
		const issue = await givenIssue(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			key: 'APP-12',
			title: 'Página nova',
		})
		return { threadId: thread.id.value, issueId: issue.id.value }
	}

	async function commands(name: string) {
		const db = testBed.resolve(LibSqlDatabaseDriver).db
		return db.select().from(scheduledCommands).where(eq(scheduledCommands.name, name))
	}

	const ask = (question: string) => ({
		question,
		options: [
			{ id: 'yes', label: 'Sim' },
			{ id: 'no', label: 'Não' },
		],
		default: { kind: AskAnswerKind.OPTION, optionId: 'yes' } as const,
		effects: [],
		addresseeId: PERSON,
	})

	async function askQuestion(threadId: string, issueId: string, question: string): Promise<string> {
		const stopId = uuidv7()
		await testBed.resolve(RaiseStop).execute({ stopId, threadId, issueId, kind: StopKind.QUESTION_ASKED, detail: '', ask: ask(question) })
		return stopId
	}

	/** One string field of a queued command's JSON `input`. */
	const field = (row: { input: unknown } | undefined, key: string): string =>
		String((row?.input as Record<string, unknown> | undefined)?.[key] ?? '')

	const flush = (threadId: string, addresseeId?: string) =>
		testBed.resolve(FlushSignalDigest).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId, addresseeId })

	it('two signals for the same person → ONE message; each points at it, and its delivery starts both questions', async () => {
		const { threadId, issueId } = await setUp()
		const first = await askQuestion(threadId, issueId, 'Uso o tema claro?')
		const second = await askQuestion(threadId, issueId, 'Mantenho o rodapé?')
		// One flush for the window — the second signal's job id is the same.
		expect(await commands('flush_signal_digest')).toHaveLength(1)
		expect(await commands('deliver_channel_message')).toHaveLength(0)

		expect(await flush(threadId, PERSON)).toEqual({ flushed: 2 })

		const deliveries = await commands('deliver_channel_message')
		expect(deliveries).toHaveLength(1)
		const text = field(deliveries[0], 'text')
		expect(text).toContain('Pessoa A, 2 coisas:')
		expect(text).toContain('• APP-12 — Uso o tema claro?')
		expect(text).toContain('• APP-12 — Mantenho o rodapé?')

		const threads = testBed.resolve(ThreadRepository)
		const digest = (await threads.listEntries(threadId)).find(e => e.kind === TranscriptKind.SYSTEM && e.routing === OutputRouting.GROUP)
		expect(deliveries[0]?.input).toMatchObject({ replyEntryId: digest?.entryId })
		// The questions point at the digest: a quoted reply finds them, and its delivery starts their clocks.
		expect((await threads.stopsCarriedBy(digest?.entryId ?? '')).map(s => s.stopId)).toEqual([first, second])
		expect((await threads.markAskDelivered(digest?.entryId ?? '', new Date())).sort()).toEqual([first, second].sort())
	})

	it('one signal → it goes out as itself, in its own format, and is recorded as sent to the group', async () => {
		const { threadId, issueId } = await setUp()
		const stopId = await askQuestion(threadId, issueId, 'Uso o tema claro?')

		expect(await flush(threadId, PERSON)).toEqual({ flushed: 1 })

		const [delivery] = await commands('deliver_channel_message')
		expect(field(delivery, 'text')).toContain('APP-12 — Uso o tema claro?')
		expect(field(delivery, 'text')).toContain('Se ninguém responder em 15 min: Sim.')
		const stop = await testBed.resolve(ThreadRepository).findStop(stopId)
		const entry = await testBed.resolve(ThreadRepository).findEntry(stop?.askEntryId ?? '')
		expect(entry?.routing).toBe(OutputRouting.GROUP)
		expect(delivery?.input).toMatchObject({ replyEntryId: entry?.entryId })
	})

	it('a second flush of the same window sends nothing', async () => {
		const { threadId, issueId } = await setUp()
		await askQuestion(threadId, issueId, 'Uso o tema claro?')
		await askQuestion(threadId, issueId, 'Mantenho o rodapé?')

		await flush(threadId, PERSON)
		expect(await flush(threadId, PERSON)).toEqual({ flushed: 0 })
		expect(await commands('deliver_channel_message')).toHaveLength(1)
	})

	it('a decision never waits for the digest', async () => {
		const { threadId, issueId } = await setUp()
		await testBed.resolve(RaiseStop).execute({
			stopId: uuidv7(),
			threadId,
			issueId,
			kind: StopKind.DECISION_REQUESTED,
			detail: '',
			ask: { ...ask('Publico?'), default: undefined, effects: [AskEffect.PUBLISH] },
		})

		expect(await commands('deliver_channel_message')).toHaveLength(1)
		expect(await commands('flush_signal_digest')).toHaveLength(0)
		expect(await flush(threadId, PERSON)).toEqual({ flushed: 0 })
	})

	it('a signal with no declared person goes in the digest of whoever asked for the work', async () => {
		const { threadId } = await setUp()
		const threads = testBed.resolve(ThreadRepository)
		const thread = await threads.findById(threadId)
		const origin = thread?.recordEntry({ kind: TranscriptKind.CONTACT, text: 'faz a página nova', senderExternalId: PERSON })
		if (thread) await threads.save(thread)
		const issueId = (await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId, key: 'APP-13', originEntryId: origin?.entryId }))
			.id.value

		const out = await testBed
			.resolve(DeliverIssueSignal)
			.execute({ signalId: uuidv7(), threadId, issueId, level: IssueSignalLevel.FEEDBACK, text: 'prévia pronta' })

		expect(out.routing).toBe(OutputRouting.DIGEST)
		expect((await threads.findEntry(out.entryId))?.addresseeId).toBe(PERSON)
		expect(await flush(threadId, PERSON)).toEqual({ flushed: 1 })
	})

	it('a lone FEEDBACK goes out WITH its print and does not hold the issue', async () => {
		const { threadId, issueId } = await setUp()
		const path = join(scratch, 'preview.png')
		writeFileSync(path, 'png')
		const main = await givenArtifact(testBed, threadId, { issueId, ref: path })
		const other = await givenArtifact(testBed, threadId, { issueId, kind: ArtifactKind.LINK, ref: 'https://preview.example.test' })

		const out = await testBed.resolve(DeliverIssueSignal).execute({
			signalId: uuidv7(),
			threadId,
			issueId,
			level: IssueSignalLevel.FEEDBACK,
			text: 'prévia da página',
			addresseeId: PERSON,
			mainArtifactId: main.id.value,
			artifactIds: [main.id.value, other.id.value],
		})
		await flush(threadId, PERSON)

		const [preview] = await commands('deliver_issue_preview')
		expect(preview?.input).toMatchObject({ entryId: out.entryId })
		await testBed.resolve(DeliverIssuePreview).execute(preview?.input as { ownerId: string; threadId: string; entryId: string })

		const [attachment] = await commands('deliver_channel_attachment')
		expect(attachment?.input).toMatchObject({ artifactId: main.id.value, kind: ArtifactKind.IMAGE, replyEntryId: out.entryId })
		expect(field(attachment, 'caption')).toBe('👀 APP-12 — prévia da página')
		expect(await commands('deliver_channel_message')).toHaveLength(0)
		expect(await testBed.resolve(ThreadRepository).openStopsByIssue(issueId)).toHaveLength(0)
	})

	it('a FEEDBACK whose print is gone by the time it goes out still goes — as text', async () => {
		const { threadId, issueId } = await setUp()
		const gone = await givenArtifact(testBed, threadId, { issueId, ref: join(scratch, 'never-written.png') })
		const out = await testBed.resolve(DeliverIssueSignal).execute({
			signalId: uuidv7(),
			threadId,
			issueId,
			level: IssueSignalLevel.FEEDBACK,
			text: 'prévia',
			addresseeId: PERSON,
			mainArtifactId: gone.id.value,
		})
		await flush(threadId, PERSON)
		const [preview] = await commands('deliver_issue_preview')
		await testBed.resolve(DeliverIssuePreview).execute(preview?.input as { ownerId: string; threadId: string; entryId: string })

		expect(await commands('deliver_channel_attachment')).toHaveLength(0)
		const [text] = await commands('deliver_channel_message')
		expect(text?.input).toMatchObject({ replyEntryId: out.entryId })
	})

	it('PROGRESS in the default mode never leaves the panel — no flush, no delivery', async () => {
		const { threadId, issueId } = await setUp()

		const out = await testBed
			.resolve(DeliverIssueSignal)
			.execute({ signalId: uuidv7(), threadId, issueId, level: IssueSignalLevel.PROGRESS, text: 'rodei os testes' })

		expect(out.routing).toBe(OutputRouting.PANEL)
		expect(await commands('flush_signal_digest')).toHaveLength(0)
		expect(await commands('deliver_channel_message')).toHaveLength(0)
	})

	it('the signal fact refuses a level an issue does not say this way (a decision travels as a stop)', async () => {
		const { threadId, issueId } = await setUp()

		await testBed.resolve(RouteIssueSignal).handle(
			new ThreadIssueSignalEvent({
				ownerId: MOCK_CLOUD_OWNER_ID,
				payload: { issueId, threadId, level: IssueSignalLevel.DECISION, text: 'Publico?', artifactIds: [] },
			}) as never,
		)
		await testBed.resolve(RouteIssueSignal).handle(
			new ThreadIssueSignalEvent({
				ownerId: MOCK_CLOUD_OWNER_ID,
				payload: { issueId, threadId, level: IssueSignalLevel.PROGRESS, text: 'rodei os testes', artifactIds: [] },
			}) as never,
		)

		const entries = (await testBed.resolve(ThreadRepository).listEntries(threadId)).filter(e => e.issueId === issueId)
		expect(entries.map(e => e.level)).toEqual([IssueSignalLevel.PROGRESS])
	})

	/**
	 * The window's flush is a timer, and a timer can miss: a signal recorded while its window's flush was
	 * already running finds the job id taken (its own enqueue is a no-op) and is read by nobody; a flush that
	 * burned its attempts is dead-lettered. Both end the same way — the signal waiting, no job for it. The
	 * entry itself is the persisted state, so the overdue sweep sends it, once.
	 */
	it('a signal its window flush missed is sent by the overdue sweep — once, and not before the window passed', async () => {
		const { threadId, issueId } = await setUp()
		await askQuestion(threadId, issueId, 'Uso o tema claro?')
		// The window's flush runs and sends the first one…
		expect(await flush(threadId, PERSON)).toEqual({ flushed: 1 })
		// …and a second signal of the same window lands while that job still holds its id, then the job is
		// finalized (deleted) — the second signal is left with no job at all.
		const late = await askQuestion(threadId, issueId, 'Mantenho o rodapé?')
		const db = testBed.resolve(LibSqlDatabaseDriver).db
		await db.delete(scheduledCommands).where(eq(scheduledCommands.name, 'flush_signal_digest'))
		const threads = testBed.resolve(ThreadRepository)
		const lateEntry = await threads.findEntry((await threads.findStop(late))?.askEntryId ?? '')
		expect(lateEntry?.routing).toBe(OutputRouting.DIGEST)

		const sweep = (now: Date) => testBed.resolve(FlushOverdueDigests).execute({ now })
		// Still inside the window (plus the grace its own flush gets): the sweep leaves it alone.
		expect(await sweep(new Date())).toEqual({ flushed: 0 })
		const overdue = new Date(Date.now() + 2 * 60 * 1000)
		expect(await sweep(overdue)).toEqual({ flushed: 1 })
		expect(await sweep(overdue)).toEqual({ flushed: 0 })

		const deliveries = await commands('deliver_channel_message')
		expect(deliveries).toHaveLength(2)
		expect(field(deliveries[1], 'text')).toContain('Mantenho o rodapé?')
		expect((await threads.findEntry(lateEntry?.entryId ?? ''))?.routing).toBe(OutputRouting.GROUP)
	})

	it('the overdue sweep flushes the signals with no person too, and each person on their own', async () => {
		const { threadId, issueId } = await setUp()
		const deliver = (addresseeId?: string) =>
			testBed
				.resolve(DeliverIssueSignal)
				.execute({ signalId: uuidv7(), threadId, issueId, level: IssueSignalLevel.FEEDBACK, text: 'prévia', addresseeId })
		await deliver(PERSON)
		await deliver(undefined)
		const db = testBed.resolve(LibSqlDatabaseDriver).db
		await db.delete(scheduledCommands).where(eq(scheduledCommands.name, 'flush_signal_digest'))

		expect(await testBed.resolve(FlushOverdueDigests).execute({ now: new Date(Date.now() + 2 * 60 * 1000) })).toEqual({ flushed: 2 })
		expect(await commands('deliver_channel_message')).toHaveLength(2)
	})

	/**
	 * At-least-once on both hops: the bridge republishes a redelivered `agent.issue_spoke` under a NEW event id
	 * with the SAME `signalId`. The thread records the signal under that id — the second delivery finds it
	 * and queues nothing.
	 */
	it('a redelivered issue signal (same signalId, new event id) is recorded and sent once', async () => {
		const { threadId, issueId } = await setUp(GroupOutputMode.EVERYTHING)
		const signalId = uuidv7()
		const fact = () =>
			new ThreadIssueSignalEvent({
				ownerId: MOCK_CLOUD_OWNER_ID,
				payload: { issueId, threadId, level: IssueSignalLevel.PROGRESS, text: 'rodei os testes', artifactIds: [], signalId },
			})
		const [first, second] = [fact(), fact()]
		expect(first.id).not.toBe(second.id)

		await testBed.resolve(RouteIssueSignal).handle(first as never)
		await testBed.resolve(RouteIssueSignal).handle(second as never)

		const said = (await testBed.resolve(ThreadRepository).listEntries(threadId)).filter(e => e.issueId === issueId)
		expect(said.map(e => e.entryId)).toEqual([signalId])
		expect(await commands('deliver_channel_message')).toHaveLength(1)
	})

	it('a re-run preview command queues the print once', async () => {
		const { threadId, issueId } = await setUp()
		const path = join(scratch, 'again.png')
		writeFileSync(path, 'png')
		const main = await givenArtifact(testBed, threadId, { issueId, ref: path })
		await testBed.resolve(DeliverIssueSignal).execute({
			signalId: uuidv7(),
			threadId,
			issueId,
			level: IssueSignalLevel.FEEDBACK,
			text: 'prévia',
			addresseeId: PERSON,
			mainArtifactId: main.id.value,
		})
		await flush(threadId, PERSON)
		const [preview] = await commands('deliver_issue_preview')
		const input = preview?.input as { ownerId: string; threadId: string; entryId: string }
		await testBed.resolve(DeliverIssuePreview).execute(input)
		await testBed.resolve(DeliverIssuePreview).execute(input)

		expect(await commands('deliver_channel_attachment')).toHaveLength(1)
	})
})
