import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addWorkspace, attachThread } from '@codedm/client-typescript/typescript'
import type { ApiSession } from './api'
import { seedConnectedChannel } from './gateway'

export interface AttachedThread {
	channelId: string
	workspaceId: string
	threadId: string
	contactExternalId: string
	workspacePath: string
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
	const workspacePath = mkdtempSync(join(tmpdir(), 'codedm-e2e-ws-'))
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

	return { channelId, workspaceId: workspace.workspaceId, threadId: thread.threadId, contactExternalId, workspacePath }
}
