import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { scheduledCommands } from '@codm/contracts/db'
import { CommandQueue, LibSqlCommandQueue, LibSqlDatabaseDriver, MockLoggingService } from '@codm/core-typescript'
import { IssueControlSource, IssueStatus, MailboxTargetKind, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenThread, GIVEN_MENTION_TAG } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { IssuePausedEvent } from '@issue/events/IssuePausedEvent'
import { DomainEventRepository } from '@codm/core-typescript'
import { IngestChannelMessage } from './IngestChannelMessage'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { CUE_PAUSED, CUE_RESUMED } from '../utils/ChannelCues'
import { parseControlCommand } from '../utils/controlCommand'
import { IssueControlCommand } from '../enums'

/**
 * PAUSA COMO COMANDO (fase 2, item 2) — a control word with a target, typed in the group.
 *
 * What is measured: "pare" quoting an issue's message, or "segura APP-12" naming it, holds THAT issue
 * at once — the issue row is paused in the ingest's own transaction, no orchestrator turn is queued, the
 * only answer is the ⏸️ cue, and the message is recorded on the issue. "continue" lifts it (▶️). It works
 * while the whole conversation is paused, which is exactly when "continue" is needed. A control word
 * with no target is ordinary conversation and takes the usual path, unchanged.
 *
 * Falsifier: remove the `parseControlCommand` branch from `IngestChannelMessage` and the first test
 * finds the issue not paused and a THREAD turn queued; move it after the `canInvoke` gate and the
 * paused-conversation test finds the issue still paused.
 */
describe('a control word with a target pauses / resumes the issue, with no turn', () => {
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
		// Our own queue, never polled: the cue rows stay in the table for the assertion to read.
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

	const cues = async () =>
		(await driver.db.select().from(scheduledCommands))
			.filter(row => row.name === 'react_to_channel_message')
			.map(row => (row.input as { reaction: string }).reaction)

	const pausedOf = async (issueId: string) => (await testBed.resolve(IssueRepository).findById(issueId))?.paused

	const ingest = (threadId: string, text: string, quotedEntryId?: string) =>
		testBed.resolve(IngestChannelMessage).execute({
			threadId,
			senderExternalId: 'stranger-42',
			text,
			quotedEntryId,
			receivedAt: new Date(),
			platformMessageId: 'wamid-command',
		})

	/** A thread with one issue and one agent line linked to it — the message a person quotes. */
	const scene = async (opts: { status?: IssueStatus; paused?: boolean } = {}) => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-12', ...opts })
		const line = thread.recordEntry({ kind: TranscriptKind.SYSTEM, text: 'subindo a prévia agora', issueId: issue.id.value })
		await testBed.resolve(ThreadRepository).save(thread)
		return { thread, issue, line }
	}

	it('"pare" quoting an issue message pauses it — no turn queued, ⏸️ cue, entry on the issue', async () => {
		const { thread, issue, line } = await scene()

		const out = await ingest(thread.id.value, 'pare', line.entryId)

		expect(out.invocable).toBe(false)
		expect(await pausedOf(issue.id.value)).toBe(true)
		expect(await testBed.resolve(MailboxRepository).claimNext('control-test', 60_000)).toBeUndefined()
		expect(await cues()).toEqual([CUE_PAUSED])
		const entry = (await testBed.resolve(ThreadRepository).listEntries(thread.id.value)).find(e => e.entryId === out.entryId)
		expect(entry?.issueId).toBe(issue.id.value)
		const [fact] = await testBed.resolve(DomainEventRepository).findByType(IssuePausedEvent)
		expect(fact?.payload).toMatchObject({ issueId: issue.id.value, source: IssueControlSource.WHATSAPP, requestedById: 'stranger-42' })
	})

	it('"segura APP-12" names the issue by key — a NEEDS_INPUT one too', async () => {
		const { thread, issue } = await scene({ status: IssueStatus.NEEDS_INPUT })

		await ingest(thread.id.value, `${GIVEN_MENTION_TAG} Segura APP-12`)

		expect(await pausedOf(issue.id.value)).toBe(true)
	})

	it('"continue" quoting a paused issue resumes it, with ▶️', async () => {
		const { thread, issue, line } = await scene({ paused: true })

		await ingest(thread.id.value, 'continue', line.entryId)

		expect(await pausedOf(issue.id.value)).toBe(false)
		expect(await cues()).toEqual([CUE_RESUMED])
	})

	it('works while the whole conversation is paused', async () => {
		const { thread, issue, line } = await scene({ paused: true })
		thread.pause()
		await testBed.resolve(ThreadRepository).save(thread)

		await ingest(thread.id.value, 'retome', line.entryId)

		expect(await pausedOf(issue.id.value)).toBe(false)
	})

	it('a "pare" redelivered on an already paused issue is acknowledged, never an error', async () => {
		const { thread, issue, line } = await scene({ paused: true })

		await ingest(thread.id.value, 'pare', line.entryId)

		expect(await pausedOf(issue.id.value)).toBe(true)
		expect(await cues()).toEqual([CUE_PAUSED])
	})

	it('a control word WITHOUT a target goes to the orchestrator unchanged', async () => {
		const { thread, issue } = await scene()

		await ingest(thread.id.value, `${GIVEN_MENTION_TAG} para tudo e me explica o plano`)

		expect(await pausedOf(issue.id.value)).toBe(false)
		const item = await testBed.resolve(MailboxRepository).claimNext('control-test', 60_000)
		expect(item?.targetKind).toBe(MailboxTargetKind.THREAD)
	})

	it('"continue" on an issue that is NOT paused is a steer, not a command', async () => {
		const { thread, issue, line } = await scene()

		await ingest(thread.id.value, 'continue com o azul', line.entryId)

		const item = await testBed.resolve(MailboxRepository).claimNext('control-test', 60_000)
		expect(item?.targetKind).toBe(MailboxTargetKind.ISSUE)
		expect(item?.targetId).toBe(issue.id.value)
		expect(await cues()).not.toContain(CUE_RESUMED)
	})
})

/** The control-word parser on its own. Falsifier: match a PREFIX instead of the whole first word and "parabéns" pauses. */
describe('parseControlCommand', () => {
	it('reads the first word after mentions, folding case and accents', () => {
		expect(parseControlCommand('@codm  PARE')).toBe(IssueControlCommand.PAUSE)
		expect(parseControlCommand('Pausa, por favor APP-3')).toBe(IssueControlCommand.PAUSE)
		expect(parseControlCommand('stop')).toBe(IssueControlCommand.PAUSE)
		expect(parseControlCommand('Retomé')).toBe(IssueControlCommand.RESUME)
		expect(parseControlCommand('segue')).toBe(IssueControlCommand.RESUME)
	})

	it('a word that merely STARTS like a control word is not one', () => {
		expect(parseControlCommand('parabéns APP-12')).toBeUndefined()
		expect(parseControlCommand('seguem os prints')).toBeUndefined()
		expect(parseControlCommand('continuar depois')).toBeUndefined()
		expect(parseControlCommand('acho que pare APP-12')).toBeUndefined()
	})
})
