import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { TestBed, givenIssue, givenStop, givenThread, givenWorkspace } from '@test/support'
import {
	AGENT_RUN_TOKEN_HEADER,
	AgentIdentityMiddleware,
	DomainEventRepository,
	InMemoryAgentIdentityService,
	OutboxDispatcher,
	type HttpControllerRequest,
} from '@codm/core-typescript'
import {
	MailboxItemKind,
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
import { ThreadStopResolvedEvent } from '@thread/events/ThreadStopResolvedEvent'
import { ResolveStopController } from '@thread/controllers/ResolveStop'
import { ResolveStop } from '@thread/usecases/ResolveStop'

/**
 * AC-7 (participant-permission-posture, Decision 7) — "APPROVE" has to mean the resumed turn may do
 * what was blocked. The resume carries the posture of WHO resolved: the console (the authenticated
 * owner, resolving as the `operator` participant) grants the operator's `canElevate`; an orchestrator
 * run grants the posture its token was minted with. The fact carries it, so the handler that queues
 * the resume never has to recompute it.
 */
describe('Flow (integration): an APPROVE from someone who may elevate resumes in BYPASS', () => {
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
			const item = await mailbox.claimNext('approve-test', 60_000)
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

	it('AC-7 — APPROVE from the CONSOLE, with the operator allowed to elevate, resumes BYPASS', async () => {
		const { issue, stop } = await givenStoppedIssue()

		await testBed.resolve(ResolveStop).execute({ ownerId: MOCK_CLOUD_OWNER_ID, stopId: stop.stopId, resolution: StopResolution.APPROVE })

		expect((await resumeOf(issue.id.value))?.posture).toBe(PermissionPosture.BYPASS)
	})

	it('AC-7 — the same holds for a PERMISSION_DENIED stop', async () => {
		const { issue, stop } = await givenStoppedIssue(StopKind.PERMISSION_DENIED)

		await testBed.resolve(ResolveStop).execute({ ownerId: MOCK_CLOUD_OWNER_ID, stopId: stop.stopId, resolution: StopResolution.APPROVE })

		expect((await resumeOf(issue.id.value))?.posture).toBe(PermissionPosture.BYPASS)
	})

	it('AC-7 — APPROVE from a BYPASS orchestrator run (via MCP) resumes BYPASS', async () => {
		const { thread, issue, stop } = await givenStoppedIssue()

		await viaRun(thread.id.value, stop.stopId, StopResolution.APPROVE, PermissionPosture.BYPASS)

		expect((await resumeOf(issue.id.value))?.posture).toBe(PermissionPosture.BYPASS)
	})

	it('AC-7 — ThreadStopResolvedEvent carries the resolved posture', async () => {
		const { stop } = await givenStoppedIssue()

		await testBed.resolve(ResolveStop).execute({ ownerId: MOCK_CLOUD_OWNER_ID, stopId: stop.stopId, resolution: StopResolution.APPROVE })

		const [fact] = await testBed.resolve(DomainEventRepository).findByType(ThreadStopResolvedEvent)
		expect(fact?.payload.posture).toBe(PermissionPosture.BYPASS)
	})

	it('Decision 7 — when an item is already pending for the issue, the pending item`s posture is what runs', async () => {
		const { thread, issue, stop } = await givenStoppedIssue()
		await testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issue.id.value,
			kind: MailboxItemKind.STEER,
			payload: { issueId: issue.id.value, threadId: thread.id.value, key: 'moeda', title: 'moeda', text: 'pode gravar' },
			posture: PermissionPosture.BYPASS,
			dedupKey: `steer:${uuidv7()}`,
		})

		await testBed.resolve(ResolveStop).execute({ ownerId: MOCK_CLOUD_OWNER_ID, stopId: stop.stopId, resolution: StopResolution.DENY })

		const pending = await resumeOf(issue.id.value)
		expect(pending?.posture).toBe(PermissionPosture.BYPASS)
		// …and the DENY scheduled nothing of its own (`hasPending` rode the pending steer).
		expect(await resumeOf(issue.id.value)).toBeUndefined()
	})
})
