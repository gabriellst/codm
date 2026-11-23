import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { AgentIdentityService, FastifyHttpRouter } from '@codm/core-typescript'
import { MailboxClaimClass, MailboxItemKind, MailboxTargetKind, McpScope, PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenThread, givenWorkspace } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { PreToolHookController } from './PreToolHook'
import { AgentName } from '../enums'
import { MailboxRepository } from '../repositories/MailboxRepository'
import { IssueAttributesRepository } from '../repositories/IssueAttributesRepository'
import { ISSUE_ATTRIBUTE_DEFAULTS, IssueAttributes } from '../entities/IssueAttributes'
import { GitWorktreeProbe, MockGitWorktreeProbe } from '../services/GitWorktreeProbe'
import { ImmediateRegretWindowClock, RegretWindowClock } from '../services/RegretWindowClock'
import { PRE_TOOL_HOOK_PATH } from '../mcp/route'
import type { AgentRunIdentity } from '../types/AgentRunIdentity'

/**
 * THE HOOK'S WIRE, through the real HTTP router (fase 2, item 3). What the CLI reads is the RAW body:
 * the decision JSON or an empty object. An enveloped body, a 400 for an unexpected field, or a non-2xx
 * would all read as "the hook failed — run the command anyway", so the window would vanish without a
 * single red test anywhere else. These requests go over a socket, the way the CLI's `http` hook sends them.
 */
describe('PreToolHookController — over HTTP, as the CLI calls it', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let router: FastifyHttpRouter
	let url: string

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		testBed.override(RegretWindowClock, new ImmediateRegretWindowClock())
		router = new FastifyHttpRouter()
		const controller = testBed.resolve(PreToolHookController)
		await router.on(controller.path, controller.method, controller)
		const port = await router.listen(0)
		url = `http://127.0.0.1:${port}${PRE_TOOL_HOOK_PATH}`
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await router.stop()
		await testBed.destroy()
	})

	async function givenIssueRun(paused = false) {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { threadId: thread.id.value, paused })
		const token = testBed.resolve<AgentIdentityService<AgentRunIdentity>>(AgentIdentityService).issue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			issueId: issue.id.value,
			posture: PermissionPosture.AUTO,
			agentName: AgentName.ISSUE_WORK,
			scope: McpScope.ISSUE_HANDLING,
			expiresAt: new Date(Date.now() + 60_000),
		})
		return { issueId: issue.id.value, token }
	}

	/** The CLI's PreToolUse input for a Bash call — every field it documents, most of them ignored here. */
	const hookInput = (command: string) => ({
		session_id: 'session-1',
		transcript_path: '/tmp/transcript.jsonl',
		cwd: '/tmp/workspace',
		permission_mode: 'auto',
		hook_event_name: 'PreToolUse',
		tool_name: 'Bash',
		tool_input: { command, description: 'publish', timeout: 120000, run_in_background: false },
		tool_use_id: 'toolu_1',
	})

	const call = (command: string, token?: string) =>
		fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
			body: JSON.stringify(hookInput(command)),
		})

	it('an ordinary command → 200 with an EMPTY object: no decision, and never an "allow"', async () => {
		const { token } = await givenIssueRun()
		const response = await call('ls -la', token)
		expect(response.status).toBe(200)
		expect(await response.json()).toEqual({})
	})

	it('a push with nothing new → 200 with an empty object (it goes ahead)', async () => {
		const { token } = await givenIssueRun()
		const response = await call('git push origin main', token)
		expect(response.status).toBe(200)
		expect(await response.json()).toEqual({})
	})

	it('a push with an unread steer → the CLI decision JSON, deny, with a reason the model reads', async () => {
		const { issueId, token } = await givenIssueRun()
		await testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issueId,
			kind: MailboxItemKind.STEER,
			claimClass: MailboxClaimClass.STEER,
			posture: PermissionPosture.AUTO,
			payload: { text: 'não publique ainda' },
			dedupKey: `hook-test:${issueId}`,
		})
		const response = await call('git push origin main', token)
		expect(response.status).toBe(200)
		const body = (await response.json()) as { hookSpecificOutput: Record<string, string> }
		expect(body.hookSpecificOutput.hookEventName).toBe('PreToolUse')
		expect(body.hookSpecificOutput.permissionDecision).toBe('deny')
		expect(body.hookSpecificOutput.permissionDecisionReason).toContain('recado novo')
	})

	it('a paused issue → deny with the pause reason', async () => {
		const { token } = await givenIssueRun(true)
		const body = (await (await call('gh pr merge 3', token)).json()) as { hookSpecificOutput: Record<string, string> }
		expect(body.hookSpecificOutput.permissionDecision).toBe('deny')
		expect(body.hookSpecificOutput.permissionDecisionReason).toContain('pausada')
	})

	it('no run token → 401 (a non-2xx: the CLI runs the command — the window fails open, by decision)', async () => {
		const response = await call('git push')
		expect(response.status).toBe(401)
	})

	/** The scripted git of this environment — the very instance the hook's registration asks. */
	const scriptedGit = (): MockGitWorktreeProbe => {
		const probe = testBed.resolve(GitWorktreeProbe)
		if (!(probe instanceof MockGitWorktreeProbe)) throw new Error('integration must bind the scripted git probe')
		return probe
	}
	/** An issue run on a workspace whose repository has one secondary worktree, with its attributes row. */
	async function givenWorktreeRun() {
		const path = `/Users/dev/project-${crypto.randomUUID()}`
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, path })
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value })
		const issue = await givenIssue(testBed, { threadId: thread.id.value })
		await testBed.resolve(IssueAttributesRepository).insertIfNew(
			IssueAttributes.born({
				issueId: issue.id.value,
				ownerId: MOCK_CLOUD_OWNER_ID,
				threadId: thread.id.value,
				...ISSUE_ATTRIBUTE_DEFAULTS,
			}),
		)
		const token = testBed.resolve<AgentIdentityService<AgentRunIdentity>>(AgentIdentityService).issue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			issueId: issue.id.value,
			posture: PermissionPosture.AUTO,
			agentName: AgentName.ISSUE_WORK,
			scope: McpScope.ISSUE_HANDLING,
			expiresAt: new Date(Date.now() + 60_000),
		})
		return { issueId: issue.id.value, token, path, worktree: `${path}/.wt/task` }
	}
	const callIn = (cwd: string, token: string) =>
		fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
			body: JSON.stringify({ ...hookInput('ls'), cwd }),
		})
	/** The registered worktree of `issueId`, once the scheduled registration has run (a few ticks at most). */
	const registeredWorktree = async (issueId: string): Promise<string | undefined> => {
		for (let tick = 0; tick < 50; tick++) {
			const row = await testBed.resolve(IssueAttributesRepository).findByIssueId(issueId)
			if (row?.worktreePath) return row.worktreePath
			await new Promise(resolve => setTimeout(resolve, 5))
		}
		return undefined
	}

	/**
	 * FASE 4 (item 1, revisão 2) — the CLI waits for this answer before running the command, so the worktree
	 * registration never sits on it: with git hanging forever, the hook still answers at once.
	 *
	 * Falsifier: `await` the registration in the controller and this request never returns (the test times out).
	 */
	it('the answer never waits for git — a hanging git call still gets an immediate empty object', async () => {
		const { token } = await givenWorktreeRun()
		scriptedGit().scriptTopLevel('/Users/dev/hanging', new Promise<string | undefined>(() => undefined))
		const response = await callIn('/Users/dev/hanging', token)
		expect(response.status).toBe(200)
		expect(await response.json()).toEqual({})
	})

	it("a cwd inside a secondary worktree of the workspace registers that worktree's top, after the answer", async () => {
		const { issueId, token, path, worktree } = await givenWorktreeRun()
		const git = scriptedGit()
		git.scriptTopLevel(`${worktree}/src`, worktree)
		git.scriptWorktrees(path, [
			{ path, main: true, locked: false },
			{ path: worktree, main: false, locked: false },
		])
		const response = await callIn(`${worktree}/src`, token)
		expect(await response.json()).toEqual({})
		expect(await registeredWorktree(issueId)).toBe(worktree)
	})
})
