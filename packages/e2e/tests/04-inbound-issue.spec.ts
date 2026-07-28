import { test, expect } from '../utils/test'
import { getSessionIssues, getSessionChat, listArtifacts } from '@codedm/client-typescript/typescript'
import { givenAttachedThread, injectInboundMessage } from '../utils/given'

/**
 * Canonical flow (b) — inbound message → issue appears with its slug label → the agent session runs.
 *
 * Drives the REAL stack end to end: the gateway ingress seam publishes a normalized inbound message,
 * `ConsumeInboundMessage` dedups + ingests + classifies it, the classifier stub routes it to a
 * NEW_ISSUE, and `RunIssueTurnOnClassification` opens the issue and runs the (stubbed) agent
 * session. Assertions are scoped to THIS spec's own thread (the daemon is single-operator with a
 * shared DB, so global counts are not spec-isolated — a thread id is).
 *
 * The streamed agent reply is SSE-only in this build (a documented phase-6 deferral: terminal output
 * rides the SSE side-channel, not the persisted transcript), so the durable proof that the stub
 * runner executed to completion is the issue settling at COMPLETED; the persisted transcript carries
 * the inbound message and the classification ACTION.
 *
 * ### AC-6.2 — THE CHAIN IS DECLARED, NOT INFERRED, AND THAT IS WHAT THIS SPEC NOW PROVES
 * `IssueWorkAgent` carries a tool scope, so `RunIssueTurn` no longer mints a completion from a clean
 * exit (§4.3 rule 7): a run that only ends well leaves its issue at WORKING forever. The stub runner
 * therefore drives the REAL MCP endpoint — real JSON-RPC, real run token, real router with its scope
 * and identity checks, real generated tool, real HTTP hop, real controller, real use case — and
 * DECLARES: an artifact, then the completion. Both legs are asserted below, and neither can be
 * satisfied by text: the artifact leg passes only because the tool IS `artifact`'s own controller
 * (§4.4 item (ii)), and the COMPLETED leg passes only because a `TransitionIssueStatus` call landed.
 *
 * COMPLETED, not the intermediate WORKING, is the assertion target on purpose: WORKING is a
 * transient hop (open → stream → complete all happen inside one `RunIssueTurn.handle()` call,
 * each fact flushed through the outbox in its own commit) that the lease-based `DrizzleOutboxDispatcher`
 * can blow past between one read and the next — a single non-retried read of WORKING raced the
 * dispatcher and lost. COMPLETED is strictly downstream of WORKING (`CompleteIssue` only ever fires
 * after `OpenIssue`), so it is a STRICTLY STRONGER durability proof, not a weaker one, and polling for
 * it (rather than reading it once) makes the assertion robust to dispatch speed in both directions.
 */
test('inbound message → issue appears with slug label → session runs', async ({ given }) => {
	const user = await given.freshUser({})
	const thread = await givenAttachedThread(user.session)

	await injectInboundMessage(user.session, {
		channelId: thread.channelId,
		contactExternalId: thread.contactExternalId,
		senderExternalId: 'stranger-e2e',
		text: 'fix the login bug please',
	})

	// The classified NEW_ISSUE materializes with a slug key derived from the message.
	await expect
		.poll(
			async () => {
				const issues = await getSessionIssues(thread.threadId, { client: user.session.client })
				return issues.groups.flatMap(group => group.items).map(item => item.key)
			},
			{ timeout: 20_000, message: 'issue with slug key never materialized' },
		)
		.toContain('fix-the-login-bug-please')

	// AC-6.2, the artifact leg — read through `ListArtifacts`, the SAME query the console's thread view
	// uses. It is in the `system` scope, not `issue-handling`, so this read cannot be satisfied by the
	// tool that wrote it: the write went in one way and comes out another.
	await expect
		.poll(
			async () => {
				const artifacts = await listArtifacts(thread.threadId, { client: user.session.client })
				return artifacts.artifacts.map(artifact => artifact.name)
			},
			{ timeout: 20_000, message: 'the agent never recorded an artifact through the MCP endpoint' },
		)
		.toContain('e2e-agent: run notes')

	// The opened issue settles at COMPLETED — and under a tool-scoped agent the ONLY producer of that
	// fact is a `TransitionIssueStatus` tool call (`RunIssueTurn` no longer infers it), so this is now
	// an assertion about a DECLARATION that travelled the whole MCP chain, not about a clean exit.
	await expect
		.poll(
			async () => {
				const issues = await getSessionIssues(thread.threadId, { client: user.session.client })
				const opened = issues.groups.flatMap(group => group.items).find(item => item.key === 'fix-the-login-bug-please')
				return opened?.status
			},
			{ timeout: 20_000, message: 'issue never settled at COMPLETED (stuck at WORKING/STOPPED — the agent never DECLARED completion over MCP)' },
		)
		.toBe('COMPLETED')

	// The persisted transcript carries the inbound message + the classification action.
	const chat = await getSessionChat(thread.threadId, { client: user.session.client })
	expect(chat.transcript.some(entry => entry.kind === 'CONTACT' && entry.text.includes('fix the login bug'))).toBe(true)
	expect(chat.transcript.some(entry => entry.kind === 'ACTION')).toBe(true)
	// Live session ⇒ the composer is in whisper (STEER) mode, not paused/direct.
	expect(chat.composerMode).toBe('STEER')
})
