import { test, expect } from '../utils/test'
import { getSessionIssues, getSessionChat, listArtifacts } from '@codm/client-typescript/typescript'
import { givenFreshUser, givenAttachedThread, injectInboundMessage } from '../utils/given'

/**
 * Canonical flow (b) — inbound message → issue appears with its slug label → the agent session runs.
 *
 * Drives the REAL stack end to end: the gateway ingress seam publishes a normalized inbound message,
 * `ConsumeInboundMessage` dedups and ingests it, and the SAME TRANSACTION queues a turn of the
 * thread's orchestrator; the `MailboxDispatcher` claims it, `RunOrchestratorTurn` runs the (stubbed)
 * agent, and that agent FORKS an issue through the real `issue/create` tool. Assertions are scoped to THIS spec's own thread (the daemon is single-operator with a
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
test('inbound message → issue appears with slug label → session runs', async () => {
	const user = await givenFreshUser({})
	const thread = await givenAttachedThread(user.session)

	await injectInboundMessage(user.session, {
		channelId: thread.channelId,
		contactExternalId: thread.contactExternalId,
		senderExternalId: 'stranger-e2e',
		// The thread is gated on its minted citation from birth — an uncited message is transcribed and
		// never classified, so without this the poll below simply times out.
		text: `${thread.mentionTag} fix the login bug please`,
	})

	// The FORKED issue materializes with a slug key derived from the GOAL the orchestrator chose —
	// no longer from the inbound text. That is the pivot in one assertion: an issue exists because the
	// agent asked for one out loud (D1), not because a classifier inferred one from a message.
	await expect
		.poll(
			async () => {
				const issues = await getSessionIssues(thread.threadId, { client: user.session.client })
				return issues.groups.flatMap(group => group.items).map(item => item.key)
			},
			{ timeout: 20_000, message: 'issue with slug key never materialized' },
		)
		// `E2eStubAgentRunner.FORK_GOAL` slugged — the deterministic stand-in for what a model would pass
		// to the tool. Before the pivot this was the slug of the MESSAGE, because the classifier derived
		// it there.
		.toContain('e2e-agent-fix-the-login-bug')

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
				const opened = issues.groups.flatMap(group => group.items).find(item => item.key === 'e2e-agent-fix-the-login-bug')
				return opened?.status
			},
			{
				timeout: 20_000,
				message: 'issue never settled at COMPLETED (stuck at WORKING/STOPPED — the agent never DECLARED completion over MCP)',
			},
		)
		.toBe('COMPLETED')

	// The persisted transcript carries the inbound message + the classification action.
	const chat = await getSessionChat(thread.threadId, { client: user.session.client })
	expect(chat.transcript.some(entry => entry.kind === 'CONTACT' && entry.text.includes('fix the login bug'))).toBe(true)
	// NOT `ACTION` any more. That kind's only producer was `ClassifyMessage`, which the pivot deleted —
	// spec §5 declares it an orphan to be DECLARED rather than repurposed. What the transcript carries
	// instead is the orchestrator's own reply, written as SYSTEM by `DeliverOrchestratorReply`, which is
	// the first producer of that kind and a strictly better proof: it means the agent SPOKE, not merely
	// that a classifier annotated a row.
	expect(chat.transcript.some(entry => entry.kind === 'SYSTEM')).toBe(true)
	// Live session ⇒ the composer DEFAULTS to DIRECT (the founder's rule in GetSessionChat: a running
	// thread is a live conversation, so Enter talks to the people in it; STEER is the paused default).
	expect(chat.composerMode).toBe('DIRECT')
})
