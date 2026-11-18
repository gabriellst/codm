import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenIssue, givenStop, givenThread } from '@test/support'
import {
	AskAnswerKind,
	IssueSignalLevel,
	IssueTimelineItemKind,
	OutputRouting,
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
	StopKind,
	StopResolution,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { AnswerStop } from '@thread/usecases/AnswerStop'
import { GetIssueTimeline } from './GetIssueTimeline'

/**
 * THE TIMELINE (fase 1, item 1) — what happened to one issue, oldest first, assembled from facts that
 * already exist: transcript entries linked to it, steers on the queue, and its stops with their answers.
 *
 * Falsifier: drop any source from the query and its kind disappears from `kinds`.
 */
describe('GetIssueTimeline', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const tick = () => new Promise(resolve => setTimeout(resolve, 3))

	it('lists messages, steers and a stop with its answer, oldest first, each as its own kind', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { threadId: thread.id.value })
		const threads = testBed.resolve(ThreadRepository)

		thread.recordEntry({ kind: TranscriptKind.SYSTEM, text: 'prévia pronta', issueId: issue.id.value })
		await threads.save(thread)
		await tick()

		await testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issue.id.value,
			kind: MailboxItemKind.STEER,
			posture: PermissionPosture.AUTO,
			payload: { threadId: thread.id.value, key: issue.key, title: issue.title, text: 'tira o rodapé' },
			dedupKey: 'timeline-steer',
		})
		await tick()

		const stop = thread.raiseStop({ issueId: issue.id.value, kind: StopKind.APPROVAL_NEEDED, title: 'posso publicar?', detail: '' })
		await threads.save(thread)
		await tick()
		thread.resolveStop(stop, StopResolution.APPROVE, PermissionPosture.AUTO)
		await threads.save(thread)

		const { items } = await testBed.resolve(GetIssueTimeline).execute({ ownerId: MOCK_CLOUD_OWNER_ID, issueId: issue.id.value })
		const kinds = items.map(item => item.kind)

		expect(kinds).toEqual([
			IssueTimelineItemKind.MESSAGE,
			IssueTimelineItemKind.STEER,
			IssueTimelineItemKind.STOP_RAISED,
			IssueTimelineItemKind.STOP_RESOLVED,
		])
		const steer = items[1]
		expect(steer?.kind === IssueTimelineItemKind.STEER && steer.text).toBe('tira o rodapé')
		const resolved = items[3]
		expect(resolved?.kind === IssueTimelineItemKind.STOP_RESOLVED && resolved.resolution).toBe(StopResolution.APPROVE)
	})

	it('fase 3 — a message carries its level and routing; an ask its code, question and options; its answer what was answered, never who', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-12' })
		const threads = testBed.resolve(ThreadRepository)

		thread.recordEntry({
			kind: TranscriptKind.SYSTEM,
			text: 'rodei os testes',
			issueId: issue.id.value,
			level: IssueSignalLevel.PROGRESS,
			routing: OutputRouting.PANEL,
		})
		await threads.save(thread)
		await tick()
		const options = [
			{ id: 'yes', label: 'Sim' },
			{ id: 'no', label: 'Não' },
		]
		const stop = await givenStop(testBed, {
			threadId: thread.id.value,
			issueId: issue.id.value,
			ask: { question: 'Uso o tema escuro?', options, effects: [], requested: StopKind.DECISION_REQUESTED },
		})
		await tick()
		await testBed
			.resolve(AnswerStop)
			.execute({
				ownerId: MOCK_CLOUD_OWNER_ID,
				stopId: stop.stopId,
				answer: { kind: AskAnswerKind.OPTION, optionId: 'no' },
				answeredBy: 'operator',
			})

		const { items } = await testBed.resolve(GetIssueTimeline).execute({ ownerId: MOCK_CLOUD_OWNER_ID, issueId: issue.id.value })

		const message = items.find(item => item.kind === IssueTimelineItemKind.MESSAGE)
		expect(message?.kind === IssueTimelineItemKind.MESSAGE && [message.level, message.routing]).toEqual([
			IssueSignalLevel.PROGRESS,
			OutputRouting.PANEL,
		])
		const raised = items.find(item => item.kind === IssueTimelineItemKind.STOP_RAISED)
		expect(raised?.kind === IssueTimelineItemKind.STOP_RAISED && raised.ask).toEqual({
			code: 'APP-12 · D1',
			question: 'Uso o tema escuro?',
			options,
			dueAt: undefined,
		})
		const resolved = items.find(item => item.kind === IssueTimelineItemKind.STOP_RESOLVED)
		expect(resolved?.kind === IssueTimelineItemKind.STOP_RESOLVED && resolved.answer).toEqual({ kind: AskAnswerKind.OPTION, label: 'Não' })
		expect(JSON.stringify(resolved)).not.toContain('operator')
	})

	it("another owner's issue is not found", async () => {
		const issue = await givenIssue(testBed, {})
		const failure = await testBed
			.resolve(GetIssueTimeline)
			.execute({ ownerId: '00000000-0000-4000-8000-0000000000ff', issueId: issue.id.value })
			.then(
				() => undefined,
				(error: unknown) => error,
			)
		expect(failure).toEqual(expect.objectContaining({ name: 'ISSUE_NOT_FOUND' }))
	})
})
