import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addWorkspace, attachThread, getThreadSettings } from '@codm/client-typescript/typescript'
import type { ApiSession } from './api'
import { seedConnectedChannel } from './gateway'

export interface AttachedThread {
	channelId: string
	workspaceId: string
	threadId: string
	contactExternalId: string
	workspacePath: string
	/**
	 * The citation the thread was gated on, minted server-side by `AttachThread` from the workspace
	 * folder name. Read BACK through the SDK rather than recomputed here: the e2e workspace path is a
	 * `mkdtemp` name, so the tag is non-deterministic, and recomputing it would put a second copy of
	 * `mintMentionTag` in the test suite — the copy that stays green when the real one breaks.
	 */
	mentionTag: string
}

/**
 * Composed given: the state a thread-bound flow starts from — a CONNECTED channel (seeded via the
 * gateway seam), a real on-disk workspace folder (AddWorkspace verifies it exists), and a Thread
 * attached to (channel, contact) with the CLAUDE_CODE provider (DETECTED by the canned e2e detector).
 * Built directly through the SDK + seam, never through the flow under test.
 */
export async function givenAttachedThread(
	session: ApiSession,
	overrides: { contactExternalId?: string; displayName?: string; providers?: string[] } = {},
): Promise<AttachedThread> {
	const channelId = await seedConnectedChannel(session)
	// A real directory — AddWorkspace stat()s the path and rejects a missing one.
	const workspacePath = mkdtempSync(join(tmpdir(), 'codm-e2e-ws-'))
	const workspace = await addWorkspace({ path: workspacePath }, { client: session.client })

	const contactExternalId = overrides.contactExternalId ?? `55119${Math.floor(Math.random() * 1e8)}`
	const thread = await attachThread(
		{
			contactRef: {
				channelId,
				externalId: contactExternalId,
				displayName: overrides.displayName ?? 'Ada',
				kind: 'USER',
			},
			workspaceId: workspace.workspaceId,
			providers: (overrides.providers ?? ['CLAUDE_CODE']) as ('CLAUDE_CODE' | 'CODEX' | 'OPENCODE')[],
		},
		{ client: session.client },
	)

	// The gate is ON from birth, so every inbound in these specs has to cite the thread.
	const settings = await getThreadSettings(thread.threadId, { client: session.client })
	if (!settings.mentionGate.enabled) throw new Error('attach did not gate the thread — the mention gate should be on from birth')

	return {
		channelId,
		workspaceId: workspace.workspaceId,
		threadId: thread.threadId,
		contactExternalId,
		workspacePath,
		mentionTag: settings.mentionGate.tag,
	}
}
