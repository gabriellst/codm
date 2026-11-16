import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenIssue, givenThread } from '@test/support'
import { StopKind } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { DeclareStop } from '@agent/usecases/DeclareStop'
import { SendDirectMessage } from './SendDirectMessage'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ChannelConnectivity } from '../services/ChannelConnectivity'

/**
 * A PAUSED ISSUE'S RUN SAYS NOTHING OUTSIDE (fase 2, item 2 — pausa como comando).
 *
 * The external tools an issue's run can call refuse with ISSUE_PAUSED while that issue — or its whole
 * conversation — is held: measured here on SendDirectMessage (the run's voice on the channel) and on
 * RaiseStop's use case (a Needs-you card is visible too). The same calls from a run that is not held go
 * through, and the operator's own direct message — no acting issue — still works in a paused group,
 * which is what that door is for.
 *
 * Falsifier: remove `hold.assertNotHeld` from `SendDirectMessage` and the first case sends the message.
 */
describe('a held issue’s run is refused by its external tools', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
		// SendDirectMessage gates on the Go gateway's table, which no test has behind it.
		testBed.override(ChannelConnectivity, { isConnected: async () => true, anyConnected: async () => true } as ChannelConnectivity)
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const say = (threadId: string, issueId?: string) =>
		testBed.resolve(SendDirectMessage).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId, text: 'prévia pronta', issueId })

	it('SendDirectMessage from a paused issue → ISSUE_PAUSED; from a running one → sent', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const paused = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-12', paused: true })
		const running = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-13' })

		await expect(say(thread.id.value, paused.id.value)).rejects.toMatchObject({ name: 'ISSUE_PAUSED' })
		expect((await say(thread.id.value, running.id.value)).entryId).toBeTruthy()
	})

	it('a paused CONVERSATION refuses its issues’ runs — but not the operator speaking for themselves', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-14' })
		thread.pause()
		await testBed.resolve(ThreadRepository).save(thread)

		await expect(say(thread.id.value, issue.id.value)).rejects.toMatchObject({ name: 'ISSUE_PAUSED' })
		expect((await say(thread.id.value)).entryId).toBeTruthy()
	})

	it('RaiseStop from a paused issue’s run → ISSUE_PAUSED; the orchestrator raising it on that issue is not gated', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-15', paused: true })
		const stop = (actingIssueId?: string) =>
			testBed.resolve(DeclareStop).execute({
				ownerId: MOCK_CLOUD_OWNER_ID,
				threadId: thread.id.value,
				issueId: issue.id.value,
				kind: StopKind.APPROVAL_NEEDED,
				detail: 'posso publicar?',
				actingIssueId,
			})

		await expect(stop(issue.id.value)).rejects.toMatchObject({ name: 'ISSUE_PAUSED' })
		expect((await stop()).stopId).toBeTruthy()
	})
})
