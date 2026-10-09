import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import type { ZodType } from 'zod'
import { TestBed, GIVEN_MENTION_TAG, givenIssue, givenThread, givenWorkspace } from '@test/support'
import { MailboxItemKind, MailboxTargetKind, PermissionPosture, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ForkIssueController } from '@agent/controllers/ForkIssue'
import { SteerIssueTurnController } from '@agent/controllers/SteerIssueTurn'
import { MailboxRepository, type ClaimedMailboxItem } from '@agent/repositories/MailboxRepository'
import { RunIssueTurn } from '@agent/usecases/RunIssueTurn'
import { AgentRunner } from '@agent/services/AgentRunner'
import { AgentRunnerFactory, FixedAgentRunnerFactory } from '@agent/services/AgentRunnerFactory'
import { AgentRunOutcome } from '@agent/enums'
import type { AgentRunRequest } from '@agent/types/AgentRunRequest'
import type { AgentRuntimeEvent } from '@agent/types/AgentRuntimeEvent'
import { IngestChannelMessage } from '@thread/usecases/IngestChannelMessage'
import { SteerThread } from '@thread/usecases/SteerThread'
import { SetParticipantElevation } from '@thread/usecases/ConfigureThreadSettings'

class CompletingRunner extends AgentRunner {
	async *run<OutputSchema extends ZodType | undefined = undefined>(
		_request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent> {
		yield { type: 'finished', result: { outcome: AgentRunOutcome.COMPLETED, replyText: 'feito', sessionId: 's', failed: false } }
	}
	async shutdown(): Promise<void> {}
}

const MEMBER = '5511900000031@s.whatsapp.net'

/**
 * AC-4 / AC-5 / AC-6 (participant-permission-posture, Decision 4) — every item carries the posture of
 * WHO triggered it: a message typed in the channel by its sender's `canElevate`; a console whisper by
 * the `operator`'s; a loop tick and an `ISSUE_RESULT` always AUTO; work queued from INSIDE a turn by
 * the posture the run token was minted with.
 */
describe('Flow (integration): the posture is stamped by whoever triggered the work', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeEach(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const claimAll = async (): Promise<ClaimedMailboxItem[]> => {
		const mailbox = testBed.resolve(MailboxRepository)
		const claimed: ClaimedMailboxItem[] = []
		for (;;) {
			const item = await mailbox.claimNext('posture-test', 60_000)
			if (!item) return claimed
			claimed.push(item)
			await mailbox.complete(item.id)
		}
	}

	const roomThread = async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		return givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
			participants: [
				{ participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true, canElevate: true },
				{ participantId: MEMBER, name: 'Ada', source: 'Channel group member', canInvoke: true, canElevate: false },
			],
		})
	}

	const ingest = (threadId: string, senderExternalId: string) =>
		testBed.resolve(IngestChannelMessage).execute({
			threadId,
			senderExternalId,
			text: `${GIVEN_MENTION_TAG} troca a moeda da Loja 01`,
			receivedAt: new Date(),
		})

	it('AC-4 — a message from a participant WITH canElevate queues BYPASS; one WITHOUT queues AUTO', async () => {
		const thread = await roomThread()

		await ingest(thread.id.value, 'operator')
		await ingest(thread.id.value, MEMBER)

		const postures = (await claimAll()).map(item => item.posture)
		expect(postures).toEqual([PermissionPosture.BYPASS, PermissionPosture.AUTO])
	})

	it('AC-4/AC-5 — a console whisper follows the operator`s canElevate; a loop tick is always AUTO', async () => {
		const thread = await roomThread()

		await testBed.resolve(SteerThread).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, text: 'pode seguir' })
		await testBed
			.resolve(SteerThread)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, text: 'bom dia', firedByLoop: 'seg 09:00' })

		expect((await claimAll()).map(item => item.posture)).toEqual([PermissionPosture.BYPASS, PermissionPosture.AUTO])
	})

	it('AC-4 — after the operator withdraws their own elevation, their whisper queues AUTO', async () => {
		const thread = await roomThread()
		await testBed
			.resolve(SetParticipantElevation)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, participantId: 'operator', canElevate: false })

		await testBed.resolve(SteerThread).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, text: 'pode seguir' })

		expect((await claimAll()).map(item => item.posture)).toEqual([PermissionPosture.AUTO])
	})

	it('AC-5 — SteerThread`s STEER items to open issues carry the operator`s posture too', async () => {
		const thread = await roomThread()
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, key: 'moeda' })

		await testBed.resolve(SteerThread).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, text: 'usa BRL' })

		const steer = (await claimAll()).find(item => item.targetKind === MailboxTargetKind.ISSUE && item.targetId === issue.id.value)
		expect(steer?.kind).toBe(MailboxItemKind.STEER)
		expect(steer?.posture).toBe(PermissionPosture.BYPASS)
	})

	it('AC-5 — a loop tick`s STEER to an open issue is AUTO even though the operator holds canElevate', async () => {
		const thread = await roomThread()
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, key: 'moeda' })

		await testBed
			.resolve(SteerThread)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, text: 'bom dia', firedByLoop: 'seg 09:00' })

		const steer = (await claimAll()).find(item => item.targetKind === MailboxTargetKind.ISSUE && item.targetId === issue.id.value)
		expect(steer?.kind).toBe(MailboxItemKind.STEER)
		expect(steer?.posture).toBe(PermissionPosture.AUTO)
	})

	it('AC-6 — ForkIssue stamps the WORK item with the run token`s posture', async () => {
		const thread = await roomThread()

		for (const posture of [PermissionPosture.BYPASS, PermissionPosture.AUTO]) {
			await testBed.resolve(ForkIssueController).handle({
				ctx: {
					ownerId: MOCK_CLOUD_OWNER_ID,
					agentIdentity: { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, entryId: uuidv7(), scope: 'orchestration', posture },
				},
				params: { threadId: thread.id.value },
				body: { goal: `troca a moeda (${posture})` },
			} as Parameters<ForkIssueController['handle']>[0])
		}

		const work = (await claimAll()).filter(item => item.kind === MailboxItemKind.WORK)
		expect(work.map(item => item.posture)).toEqual([PermissionPosture.BYPASS, PermissionPosture.AUTO])
	})

	it('AC-6 — SteerIssueTurn stamps the STEER item with the run token`s posture', async () => {
		const thread = await roomThread()
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, key: 'moeda' })

		await testBed.resolve(SteerIssueTurnController).handle({
			ctx: {
				ownerId: MOCK_CLOUD_OWNER_ID,
				agentIdentity: {
					ownerId: MOCK_CLOUD_OWNER_ID,
					threadId: thread.id.value,
					entryId: uuidv7(),
					scope: 'orchestration',
					posture: PermissionPosture.BYPASS,
				},
			},
			params: { threadId: thread.id.value, issueId: issue.id.value },
			body: { text: 'usa BRL' },
		} as Parameters<SteerIssueTurnController['handle']>[0])

		const steer = (await claimAll()).find(item => item.targetId === issue.id.value)
		expect(steer?.posture).toBe(PermissionPosture.BYPASS)
	})

	it('AC-4 — the ISSUE_RESULT a BYPASS issue turn queues back to the orchestrator is AUTO', async () => {
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(new CompletingRunner()))
		const thread = await roomThread()

		await testBed.resolve(RunIssueTurn).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			issueId: uuidv7(),
			threadId: thread.id.value,
			key: 'moeda',
			title: 'Troca a moeda',
			provider: ProviderKind.CLAUDE_CODE,
			workspacePath: '/tmp/workspace',
			prompt: 'troca a moeda',
			turnKind: MailboxItemKind.WORK,
			messageId: uuidv7(),
			posture: PermissionPosture.BYPASS,
		})

		const result = (await claimAll()).find(item => item.kind === MailboxItemKind.ISSUE_RESULT)
		expect(result?.posture).toBe(PermissionPosture.AUTO)
	})
})
