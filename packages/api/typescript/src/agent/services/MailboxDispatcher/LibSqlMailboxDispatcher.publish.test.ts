import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { LibSqlDatabaseDriver } from '@codm/core-typescript'
import { agentMailbox } from '@codm/contracts/db'
import {
	AskEffect,
	MailboxClaimClass,
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
	ProviderKind,
	StopKind,
	StopResolution,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenStop, givenThread, givenWorkspace } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ResumeIssuePayloadSchema } from '@thread/objects'
import { SetWorkspacePublishCommand } from '@workspace/usecases/SetWorkspacePublishCommand'
import { ISSUE_ATTRIBUTE_DEFAULTS, IssueAttributes } from '../../entities/IssueAttributes'
import { IssueAttributesRepository } from '../../repositories/IssueAttributesRepository'
import { MailboxRepository } from '../../repositories/MailboxRepository'
import { RunIssueTurn } from '../../usecases/RunIssueTurn'
import { GitWorktreeProbe, MockGitWorktreeProbe } from '../GitWorktreeProbe'
import { PublishCommandRunner, ScriptedPublishCommandRunner } from '../PublishCommandRunner'
import { ImmediateRegretWindowClock, RegretWindowClock } from '../RegretWindowClock'
import { MailboxDispatcher } from './MailboxDispatcher'

/**
 * THE PUBLISH TRIGGER ON THE REAL DISPATCHER (fase 4, item 6c): the answer that authorizes publishing is claimed, the
 * workspace's command runs IN PLACE of the session turn, and the item is consumed — no `RunIssueTurn`. A steer waiting
 * in the queue cancels it, and the same item then runs as the session turn it always was.
 *
 * Falsifier: drop `publishInsteadOfTurn` and the session runs; let `PUBLISH_TRIGGER` accept every class and a plain
 * steer publishes.
 */
describe('the dispatcher runs the publish command in place of the session turn', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let runner: ScriptedPublishCommandRunner
	let probe: MockGitWorktreeProbe

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
		runner = new ScriptedPublishCommandRunner()
		probe = new MockGitWorktreeProbe()
		testBed.override(PublishCommandRunner, runner)
		testBed.override(GitWorktreeProbe, probe)
		testBed.override(RegretWindowClock, new ImmediateRegretWindowClock())
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const scene = async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await testBed
			.resolve(SetWorkspacePublishCommand)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value, command: { argv: ['make', 'publish'] } })
		const thread = await givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})
		const issue = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-7' })
		const attributes = IssueAttributes.born({
			issueId: issue.id.value,
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			...ISSUE_ATTRIBUTE_DEFAULTS,
		})
		const worktreePath = `${workspace.path}/.worktrees/app-7`
		attributes.registerWorktree(worktreePath, new Date())
		await testBed.resolve(IssueAttributesRepository).insertIfNew(attributes)
		probe.scriptWorktrees(workspace.path, [
			{ path: workspace.path, main: true, locked: false },
			{ path: worktreePath, main: false, locked: false },
		])
		const stop = await givenStop(testBed, {
			threadId: thread.id.value,
			issueId: issue.id.value,
			ask: {
				question: 'Publico?',
				options: [
					{ id: 'go', label: 'Pode publicar', authorizes: [AskEffect.PUBLISH] },
					{ id: 'wait', label: 'Ainda não' },
				],
				effects: [AskEffect.PUBLISH],
				requested: StopKind.DECISION_REQUESTED,
			},
		})
		// The item the resolution queues (`ResumeIssueOnStopResolved`), written as it writes it.
		await testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issue.id.value,
			kind: MailboxItemKind.STEER,
			claimClass: MailboxClaimClass.DECISION_ANSWER,
			posture: PermissionPosture.AUTO,
			payload: ResumeIssuePayloadSchema.parse({
				issueId: issue.id.value,
				threadId: thread.id.value,
				key: 'APP-7',
				title: 'Prévia',
				text: 'The operator resolved the stop — APPROVE.',
				stopId: stop.stopId,
				resolution: StopResolution.APPROVE,
			}),
			dedupKey: `resume:${stop.stopId}`,
		})
		return { thread, issue, worktreePath }
	}

	/** Drain with the session turn scripted to record that it ran. */
	const drain = async () => {
		const sessionTurns: string[] = []
		const scripted = {
			bindContainer() {
				return this
			},
			async execute(input: { prompt: string }) {
				sessionTurns.push(input.prompt)
				return { spoke: true }
			},
		}
		const runContainer = testContainer.createChildContainer()
		runContainer.registerInstance(RunIssueTurn as never, scripted as never)
		await testBed.resolve(MailboxDispatcher).bind(runContainer).drain()
		return sessionTurns
	}
	const rowsOf = (issueId: string) =>
		testBed.resolve(LibSqlDatabaseDriver).db.select().from(agentMailbox).where(eq(agentMailbox.targetId, issueId))

	it('ask → answer → drain: the command runs in the worktree, the session never wakes, the item is consumed', async () => {
		const { issue, worktreePath } = await scene()
		const sessionTurns = await drain()

		expect(runner.runs.map(run => [run.argv, run.cwd])).toEqual([[['make', 'publish'], worktreePath]])
		// The follow-up recado (CONTINUE) is the session's NEXT turn — the publish itself woke nobody.
		expect(sessionTurns).toEqual([expect.stringContaining('succeeded')])
		const answer = (await rowsOf(issue.id.value)).find(row => row.claimClass === MailboxClaimClass.DECISION_ANSWER)
		expect(answer?.consumedAt).not.toBeNull()
		expect(answer?.attempts).toBe(1)
	})

	it('a steer already waiting cancels the window: the answer runs as the session turn, once', async () => {
		const { thread, issue } = await scene()
		await testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issue.id.value,
			kind: MailboxItemKind.STEER,
			claimClass: MailboxClaimClass.STEER,
			posture: PermissionPosture.AUTO,
			payload: { issueId: issue.id.value, threadId: thread.id.value, key: 'APP-7', title: 'Prévia', text: 'Pessoa: espera' },
			dedupKey: 'steer:waiting',
		})

		const sessionTurns = await drain()

		expect(runner.runs).toHaveLength(0)
		expect(sessionTurns[0]).toContain('APPROVE')
		expect(sessionTurns).toHaveLength(2)
	})
})
