import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LibSqlDatabaseDriver } from '@codm/core-typescript'
import { scheduledCommands } from '@codm/contracts/db'
import { GroupOutputMode, IssueSignalLevel, Language, OutputRouting, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { IssueCompletedEvent } from '@codm/contracts-typescript/wire/events'
import { TestBed, givenArtifact, givenIssue, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'
import { MaterializeIssueFromExecution } from '@issue/handlers/MaterializeIssueFromExecution'
import { ReopenIssue } from '@issue/usecases/ReopenIssue'
import { CloseIssueOnChannel, CLOSING_SUMMARY_MAX } from './CloseIssueOnChannel'

/**
 * THE CLOSING (fase 3, item 5): the declared completion — not the end of a turn — is what tells the group the
 * task is done, ONCE, as the answer to whoever asked: "✅ APP-12 · <título> — <resumo>", quoting the request.
 */
describe('CloseIssueOnChannel — integration.issue.completed → the closing line', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let scratch: string
	const PERSON = 'participant-a'

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		scratch = mkdtempSync(join(tmpdir(), 'closing-'))
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
		rmSync(scratch, { recursive: true, force: true })
	})

	async function setUp(mode = GroupOutputMode.DECISIONS_AND_LIVE) {
		const threads = testBed.resolve(ThreadRepository)
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		thread.configureOutputMode(mode)
		thread.configureLanguage(Language.PT_BR)
		const origin = thread.recordEntry({ kind: TranscriptKind.CONTACT, text: 'faz a página nova', senderExternalId: PERSON })
		await threads.save(thread)
		// The request came over the channel: the ledger knows its platform id, so the closing can quote it.
		const consumed = testBed.resolve(ConsumedMessageRepository)
		await consumed.claim({ ownerId: MOCK_CLOUD_OWNER_ID, channelId: thread.channelId, platformMessageId: 'platform-asked' })
		await consumed.linkEntry({
			channelId: thread.channelId,
			platformMessageId: 'platform-asked',
			threadId: thread.id.value,
			entryId: origin.entryId,
		})
		const issue = await givenIssue(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			key: 'APP-12',
			title: 'Página nova',
			originEntryId: origin.entryId,
		})
		return { threadId: thread.id.value, issueId: issue.id.value, originEntryId: origin.entryId }
	}

	const completed = (p: {
		threadId: string
		issueId: string
		summary?: string
		finalArtifactId?: string
		answersEntryId?: string
		at?: Date
	}) =>
		new IssueCompletedEvent({
			ownerId: MOCK_CLOUD_OWNER_ID,
			payload: {
				issueId: p.issueId,
				threadId: p.threadId,
				key: 'APP-12',
				completedAt: p.at ?? new Date('2026-11-18T12:00:00.000Z'),
				summary: p.summary,
				finalArtifactId: p.finalArtifactId,
				answersEntryId: p.answersEntryId,
			},
		})

	async function commands(name: string) {
		const db = testBed.resolve(LibSqlDatabaseDriver).db
		return db.select().from(scheduledCommands).where(eq(scheduledCommands.name, name))
	}

	const closings = async (threadId: string) =>
		(await testBed.resolve(ThreadRepository).listEntries(threadId)).filter(e => e.level === IssueSignalLevel.CLOSING)

	it('the declared summary closes the issue in the group, quoting the message that asked for it', async () => {
		const { threadId, issueId, originEntryId } = await setUp()

		await testBed.resolve(CloseIssueOnChannel).handle(completed({ threadId, issueId, summary: 'Página no ar.' }) as never)

		const [closing] = await closings(threadId)
		expect(closing).toMatchObject({ issueId, routing: OutputRouting.GROUP, quotedEntryId: originEntryId })
		expect(closing?.text).toContain('✅ APP-12 · Página nova — Página no ar.')
		const [delivery] = await commands('deliver_channel_message')
		expect(delivery?.input).toMatchObject({ replyEntryId: closing?.entryId, quotedMessageId: 'platform-asked' })
	})

	it('an INFERRED completion (no summary) closes with "concluída"', async () => {
		const { threadId, issueId } = await setUp()

		await testBed.resolve(CloseIssueOnChannel).handle(completed({ threadId, issueId }) as never)

		expect((await closings(threadId))[0]?.text).toContain('✅ APP-12 · Página nova — concluída')
	})

	it('a long summary is cut — the whole of it stays behind the link', async () => {
		const { threadId, issueId } = await setUp()

		await testBed.resolve(CloseIssueOnChannel).handle(completed({ threadId, issueId, summary: 'x'.repeat(4000) }) as never)

		const text = (await closings(threadId))[0]?.text ?? ''
		expect(text).toContain('…')
		expect(text.length).toBeLessThan(CLOSING_SUMMARY_MAX + 80)
	})

	it('the same completion delivered twice (a new event id each time) closes ONCE', async () => {
		const { threadId, issueId } = await setUp()
		const handler = testBed.resolve(CloseIssueOnChannel)

		await handler.handle(completed({ threadId, issueId, summary: 'Página no ar.' }) as never)
		await handler.handle(completed({ threadId, issueId, summary: 'Página no ar.' }) as never)

		expect(await closings(threadId)).toHaveLength(1)
		expect(await commands('deliver_channel_message')).toHaveLength(1)
	})

	it('a reopened issue that completes again closes again — a new completion', async () => {
		const { threadId, issueId } = await setUp()
		const handler = testBed.resolve(CloseIssueOnChannel)

		await handler.handle(completed({ threadId, issueId, at: new Date('2026-11-18T12:00:00.000Z') }) as never)
		await handler.handle(completed({ threadId, issueId, at: new Date('2026-11-18T15:00:00.000Z') }) as never)

		expect(await closings(threadId)).toHaveLength(2)
	})

	/**
	 * Both consumers of the fact, the way the integration lane runs them (in order, fact after fact): the issue
	 * materializes the completion, the thread closes — in either order for one fact.
	 */
	async function deliverCompletion(event: IssueCompletedEvent, closeFirst = false) {
		const close = () => testBed.resolve(CloseIssueOnChannel).handle(event as never)
		const materialize = () => testBed.resolve(MaterializeIssueFromExecution).handle(event as never)
		if (closeFirst) {
			await close()
			await materialize()
			return
		}
		await materialize()
		await close()
	}

	// The agent declared COMPLETED twice in one cycle (the tool called again, a later turn declaring again):
	// two facts, two instants, no reopen between them. It used to close twice — the seed was each fact's instant.
	it('a SECOND declaration of the same completion cycle closes nothing more', async () => {
		const { threadId, issueId } = await setUp()

		await deliverCompletion(completed({ threadId, issueId, summary: 'Página no ar.', at: new Date('2026-11-18T12:00:00.000Z') }), true)
		await deliverCompletion(completed({ threadId, issueId, summary: 'Página no ar!', at: new Date('2026-11-18T12:00:05.000Z') }))

		expect(await closings(threadId)).toHaveLength(1)
		expect(await commands('deliver_channel_message')).toHaveLength(1)
	})

	it('…and with the issue materialized first, the same', async () => {
		const { threadId, issueId } = await setUp()

		await deliverCompletion(completed({ threadId, issueId, summary: 'Página no ar.', at: new Date('2026-11-18T12:00:00.000Z') }))
		await deliverCompletion(completed({ threadId, issueId, summary: 'Página no ar!', at: new Date('2026-11-18T12:00:05.000Z') }), true)

		expect(await closings(threadId)).toHaveLength(1)
	})

	it('reopened between the two completions, it closes again — a new cycle', async () => {
		const { threadId, issueId } = await setUp()

		await deliverCompletion(completed({ threadId, issueId, summary: 'Página no ar.', at: new Date('2026-11-18T12:00:00.000Z') }))
		await testBed.resolve(ReopenIssue).execute({ ownerId: MOCK_CLOUD_OWNER_ID, issueId })
		await deliverCompletion(completed({ threadId, issueId, summary: 'Ajustada.', at: new Date('2026-11-18T15:00:00.000Z') }))

		expect(await closings(threadId)).toHaveLength(2)
		expect(await commands('deliver_channel_message')).toHaveLength(2)
	})

	// The turn that declared the completion was answering a person's message routed to the issue: the closing is
	// that person's answer (the turn sends no reply of its own) — it quotes THEM, and reaches the group even in a
	// mode that keeps closings on the panel, or they would be left unanswered.
	it('a closing that answers a person quotes their message, and goes to the group even in DECISIONS_ONLY', async () => {
		const { threadId, issueId } = await setUp(GroupOutputMode.DECISIONS_ONLY)
		const threads = testBed.resolve(ThreadRepository)
		const thread = (await threads.findById(threadId))!
		const asked = thread.recordEntry({ kind: TranscriptKind.CONTACT, text: 'APP-12 já subiu?', senderExternalId: 'participant-b' })
		await threads.save(thread)

		await testBed
			.resolve(CloseIssueOnChannel)
			.handle(completed({ threadId, issueId, summary: 'Subiu agora.', answersEntryId: asked.entryId }) as never)

		const [closing] = await closings(threadId)
		expect(closing).toMatchObject({ routing: OutputRouting.GROUP, quotedEntryId: asked.entryId })
		expect(await commands('deliver_channel_message')).toHaveLength(1)
	})

	it('the declared final artifact goes with the closing (the preview path), as its caption', async () => {
		const { threadId, issueId } = await setUp()
		const path = join(scratch, 'final.png')
		writeFileSync(path, 'png')
		const final = await givenArtifact(testBed, threadId, { issueId, ref: path })

		await testBed
			.resolve(CloseIssueOnChannel)
			.handle(completed({ threadId, issueId, summary: 'No ar.', finalArtifactId: final.id.value }) as never)

		const [closing] = await closings(threadId)
		expect(closing?.artifactId).toBe(final.id.value)
		const [preview] = await commands('deliver_issue_preview')
		expect(preview?.input).toMatchObject({ entryId: closing?.entryId })
		expect(await commands('deliver_channel_message')).toHaveLength(0)
	})

	it('in DECISIONS_ONLY the closing stays on the panel', async () => {
		const { threadId, issueId } = await setUp(GroupOutputMode.DECISIONS_ONLY)

		await testBed.resolve(CloseIssueOnChannel).handle(completed({ threadId, issueId, summary: 'No ar.' }) as never)

		expect((await closings(threadId))[0]?.routing).toBe(OutputRouting.PANEL)
		expect(await commands('deliver_channel_message')).toHaveLength(0)
	})

	it('an issue that is gone is dropped, not retried', async () => {
		const { threadId } = await setUp()

		await testBed.resolve(CloseIssueOnChannel).handle(completed({ threadId, issueId: '01900000-0000-7000-8000-000000000000' }) as never)

		expect(await closings(threadId)).toHaveLength(0)
	})
})
