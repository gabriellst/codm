import { test, expect } from '../utils/test'
import { getSessionIssues, archiveIssue, restoreIssue } from '@codm/client-typescript/typescript'
import { givenAttachedThread, injectInboundMessage, type ApiSession } from '../utils/given'

/**
 * Canonical flow (e) — issue archive + restore.
 *
 * Materializes a real issue through the ingress chain, then drives the two control-plane commands
 * (BC5 owns the archive/restore facts) and asserts the thread's issue read reflects each transition.
 * Scoped to this spec's own thread + issue id (single-operator shared DB — a specific id is isolated,
 * a global count is not).
 */
async function openIssueId(threadId: string, client: ApiSession['client']): Promise<string> {
	let issueId = ''
	await expect
		.poll(
			async () => {
				const issues = await getSessionIssues(threadId, { client })
				issueId = issues.groups.flatMap(group => group.items)[0]?.issueId ?? ''
				return issueId
			},
			{ timeout: 20_000, message: 'no issue materialized for the thread' },
		)
		.not.toBe('')
	return issueId
}

test('issue archive → restore', async ({ given }) => {
	const user = await given.freshUser({})
	const client = user.session.client
	const thread = await givenAttachedThread(user.session)

	await injectInboundMessage(user.session, {
		channelId: thread.channelId,
		contactExternalId: thread.contactExternalId,
		senderExternalId: 'stranger-arch',
		text: `${thread.mentionTag} add a dark mode toggle`,
	})
	const issueId = await openIssueId(thread.threadId, client)

	// Archive → the issue moves into the thread's archived list.
	await archiveIssue(issueId, { client })
	await expect
		.poll(async () => (await getSessionIssues(thread.threadId, { client })).archived.map(item => item.issueId), {
			timeout: 20_000,
			message: 'issue never landed in archived[]',
		})
		.toContain(issueId)

	// Restore → the issue leaves archived and returns to an active status group.
	await restoreIssue(issueId, { client })
	await expect
		.poll(async () => (await getSessionIssues(thread.threadId, { client })).archived.map(item => item.issueId), {
			timeout: 20_000,
			message: 'issue never left archived[] after restore',
		})
		.not.toContain(issueId)

	const after = await getSessionIssues(thread.threadId, { client })
	expect(after.groups.flatMap(group => group.items).map(item => item.issueId)).toContain(issueId)
})
