import type { ApiSession } from './api'

/**
 * Trigger ONE agent turn against an issue the spec already knows — the spec side of the daemon's
 * `/v1/_test/agent/run-turn` door (mounted only under CODEDM_E2E).
 *
 * The turn is the real use case on the real DI graph; only the TRIGGER is test-only. It exists
 * because the SSE observer for an issue must be attached BEFORE the run streams, and on the
 * production path the issue id is minted in the same tick the run starts — see the controller for
 * the two alternatives that were built, measured and rejected.
 */
export async function runIssueTurn(
	session: ApiSession,
	input: { issueId: string; threadId: string; key: string; title: string; workspacePath: string; prompt: string },
): Promise<{ issueId: string; outcome: string }> {
	const res = await session.client<{ issueId: string; outcome: string }>({
		method: 'POST',
		url: '/v1/_test/agent/run-turn',
		data: input,
	})
	return res.data
}
