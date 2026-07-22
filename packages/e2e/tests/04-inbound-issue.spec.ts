import { test, expect } from '../utils/test'
import { getSessionIssues, getSessionChat } from '@codedm/client-typescript/typescript'
import { givenAttachedThread, injectInboundMessage } from '../utils/given'

/**
 * Canonical flow (b) — inbound message → issue appears with its slug label → the agent session runs.
 *
 * Drives the REAL stack end to end: the gateway ingress seam publishes a normalized inbound message,
 * `ConsumeInboundMessage` dedups + ingests + classifies it, the classifier stub routes it to a
 * NEW_ISSUE, and `RunTerminalSessionOnClassification` opens the issue and runs the (stubbed) agent
 * session. Assertions are scoped to THIS spec's own thread (the daemon is single-operator with a
 * shared DB, so global counts are not spec-isolated — a thread id is).
 *
 * The streamed agent reply is SSE-only in this build (a documented phase-6 deferral: terminal output
 * rides the SSE side-channel, not the persisted transcript), so the durable proof that the stub
 * runner executed is the issue reaching WORKING; the persisted transcript carries the inbound message
 * and the classification ACTION.
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

	// The opened issue advanced to WORKING — proof the stubbed agent session actually ran.
	const issues = await getSessionIssues(thread.threadId, { client: user.session.client })
	const opened = issues.groups.flatMap(group => group.items).find(item => item.key === 'fix-the-login-bug-please')
	expect(opened?.status).toBe('WORKING')

	// The persisted transcript carries the inbound message + the classification action.
	const chat = await getSessionChat(thread.threadId, { client: user.session.client })
	expect(chat.transcript.some(entry => entry.kind === 'CONTACT' && entry.text.includes('fix the login bug'))).toBe(true)
	expect(chat.transcript.some(entry => entry.kind === 'ACTION')).toBe(true)
	// Live session ⇒ the composer is in whisper (STEER) mode, not paused/direct.
	expect(chat.composerMode).toBe('STEER')
})
