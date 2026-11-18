import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
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
import { RaiseStop } from './RaiseStop'

/**
 * The per-person digest (fase 3, item 2) and the FEEDBACK's preview. A question and a feedback for the same
 * person within 60 s leave as ONE message; a lone one leaves as itself (a feedback with its print); a
 * decision never waits; progress stays on the panel in the default mode.
 *
 * The flush is a command (`flush_signal_digest`) the policy schedules a window later — here it is called
 * directly, as the queue would after the window, and the assertions read the durable command rows.
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
	beforeEach(async () => {
		await testBed.reset()
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
		expect(text).toContain('• APP-12 · D1 — Uso o tema claro?')
		expect(text).toContain('• APP-12 · D2 — Mantenho o rodapé?')

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
		expect(field(delivery, 'text')).toContain('APP-12 · D1 — Uso o tema claro?')
		expect(field(delivery, 'text')).toContain('Sigo com Sim se ninguém disser o contrário em 15 min.')
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
			.execute({ threadId, issueId, level: IssueSignalLevel.FEEDBACK, text: 'prévia pronta' })

		expect(out.routing).toBe(OutputRouting.DIGEST)
		expect((await threads.findEntry(out.entryId))?.addresseeId).toBe(PERSON)
		expect(await flush(threadId, PERSON)).toEqual({ flushed: 1 })
	})

	it('a lone FEEDBACK goes out WITH its print — the caption says how many others stay on the console — and does not hold the issue', async () => {
		const { threadId, issueId } = await setUp()
		const path = join(scratch, 'preview.png')
		writeFileSync(path, 'png')
		const main = await givenArtifact(testBed, threadId, { issueId, ref: path })
		const other = await givenArtifact(testBed, threadId, { issueId, kind: ArtifactKind.LINK, ref: 'https://preview.example.test' })

		const out = await testBed.resolve(DeliverIssueSignal).execute({
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
		expect(field(attachment, 'caption')).toContain('APP-12 · prévia — prévia da página (+1 no console)')
		expect(await commands('deliver_channel_message')).toHaveLength(0)
		expect(await testBed.resolve(ThreadRepository).openStopsByIssue(issueId)).toHaveLength(0)
	})

	it('a FEEDBACK whose print is gone by the time it goes out still goes — as text', async () => {
		const { threadId, issueId } = await setUp()
		const gone = await givenArtifact(testBed, threadId, { issueId, ref: join(scratch, 'never-written.png') })
		const out = await testBed.resolve(DeliverIssueSignal).execute({
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
			.execute({ threadId, issueId, level: IssueSignalLevel.PROGRESS, text: 'rodei os testes' })

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
})
