import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { TestBed, givenIssue, givenStop, givenThread, givenWorkspace } from '@test/support'
import {
	AGENT_RUN_TOKEN_HEADER,
	AgentIdentityMiddleware,
	InMemoryAgentIdentityService,
	OutboxDispatcher,
	type HttpControllerRequest,
} from '@codm/core-typescript'
import {
	MailboxTargetKind,
	McpScope,
	PermissionPosture,
	ProviderKind,
	StopKind,
	StopResolution,
} from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { MailboxRepository, type ClaimedMailboxItem } from '@agent/repositories/MailboxRepository'
import { ResumeIssueOnStopResolved } from '@thread/handlers/ResumeIssueOnStopResolved'
import { ResolveStopController } from '@thread/controllers/ResolveStop'
import { ResolveStop } from '@thread/usecases/ResolveStop'
import { SetParticipantElevation } from '@thread/usecases/ConfigureThreadSettings'

/**
 * INVARIANT (participant-permission-posture, Decision 7 / AC-7): a resolution never grants more than the
 * resolver holds, and "no" never lifts the filter.
 *  - An APPROVE from an AUTO orchestrator run resumes AUTO — even though the operator of the thread may
 *    elevate. FALSIFIER: make `ResolveStop` ignore `runPosture` (`thread.postureOf(OPERATOR_PARTICIPANT_ID)`
 *    always) and that case goes RED.
 *  - A DENY resumes AUTO even from the console of an operator who may elevate. FALSIFIER: flip
 *    `RESUMES_WITH_RESOLVER_POSTURE[DENY]` to `true` and the DENY cases go RED.
 *  - An APPROVE from the console of an operator who may NOT elevate resumes AUTO.
 */
describe('INVARIANT — a resolution never grants more than the resolver holds', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeEach(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		await testBed.reset()
		await testBed.spy.register(testBed.resolve(ResumeIssueOnStopResolved))
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const givenStoppedIssue = async (kind: StopKind = StopKind.APPROVAL_NEEDED) => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, key: 'moeda' })
		const stop = await givenStop(testBed, { threadId: thread.id.value, issueId: issue.id.value, kind, detail: 'Posso gravar em produção?' })
		return { thread, issue, stop }
	}

	const resumeOf = async (issueId: string): Promise<ClaimedMailboxItem | undefined> => {
		await testBed.resolve(OutboxDispatcher).flush()
		const mailbox = testBed.resolve(MailboxRepository)
		for (;;) {
			const item = await mailbox.claimNext('resolution-invariant', 60_000)
			if (!item) return undefined
			await mailbox.complete(item.id)
			if (item.targetKind === MailboxTargetKind.ISSUE && item.targetId === issueId) return item
		}
	}

	const viaRun = async (threadId: string, stopId: string, resolution: StopResolution, posture: PermissionPosture) => {
		const identities = new InMemoryAgentIdentityService()
		const token = identities.issue({
			scope: McpScope.orchestration,
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId,
			entryId: uuidv7(),
			posture,
			expiresAt: new Date(Date.now() + 60_000),
		})
		const request = {
			headers: { [AGENT_RUN_TOKEN_HEADER]: token },
			params: { stopId },
			body: { resolution },
			ctx: { ownerId: MOCK_CLOUD_OWNER_ID },
		} as unknown as HttpControllerRequest<unknown>
		await new AgentIdentityMiddleware(identities).execute(request)
		await testBed.resolve(ResolveStopController).execute(request)
	}

	it('APPROVE from an AUTO orchestrator run does NOT elevate — even with an operator who may', async () => {
		const { thread, issue, stop } = await givenStoppedIssue()

		await viaRun(thread.id.value, stop.stopId, StopResolution.APPROVE, PermissionPosture.AUTO)

		expect((await resumeOf(issue.id.value))?.posture).toBe(PermissionPosture.AUTO)
	})

	it('DENY from the console never elevates', async () => {
		const { issue, stop } = await givenStoppedIssue()

		await testBed.resolve(ResolveStop).execute({ ownerId: MOCK_CLOUD_OWNER_ID, stopId: stop.stopId, resolution: StopResolution.DENY })

		expect((await resumeOf(issue.id.value))?.posture).toBe(PermissionPosture.AUTO)
	})

	it('DENY from a BYPASS orchestrator run never elevates', async () => {
		const { thread, issue, stop } = await givenStoppedIssue(StopKind.PERMISSION_DENIED)

		await viaRun(thread.id.value, stop.stopId, StopResolution.DENY, PermissionPosture.BYPASS)

		expect((await resumeOf(issue.id.value))?.posture).toBe(PermissionPosture.AUTO)
	})

	it('APPROVE from the console of an operator who may NOT elevate resumes AUTO', async () => {
		const { thread, issue, stop } = await givenStoppedIssue()
		await testBed
			.resolve(SetParticipantElevation)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, participantId: 'operator', canElevate: false })

		await testBed.resolve(ResolveStop).execute({ ownerId: MOCK_CLOUD_OWNER_ID, stopId: stop.stopId, resolution: StopResolution.APPROVE })

		expect((await resumeOf(issue.id.value))?.posture).toBe(PermissionPosture.AUTO)
	})
})
