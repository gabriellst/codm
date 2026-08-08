// Thread given helper — sets up a Thread via the repository directly (never the use case).
import type { TestBed } from '../TestBed'
import { Id } from '@codm/core-typescript'
import { ProviderKind, ContactKind, BufferSize } from '@codm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { Thread, type Participant } from '@thread/entities/Thread'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { givenWorkspace } from './workspaces'

/** The citation every `givenThread` expects in an invoking message. Exported so suites cite it by name. */
export const GIVEN_MENTION_TAG = '@test-workspace'

type ThreadOverrides = Partial<{
	ownerId: string
	channelId: string
	contactExternalId: string
	contactDisplayName: string
	contactKind: ContactKind
	workspaceId: string
	providers: ProviderKind[]
	bufferSize: BufferSize
	/** The citation tag. Defaults to the production-shaped `@test-workspace`; pass `undefined` explicitly to vary it. */
	mentionTag: string
	/** Overrides the default two-entry roster (operator + the contact). A GROUP-thread suite exercising
	 *  the live-membership join passes its own JSON roster here, alongside `givenRemoteMembership` rows. */
	participants: Participant[]
}>

/**
 * The workspace is CREATED, not invented. `AttachThread` cannot bind a thread to a workspace id that
 * has no row (it validates via `WorkspaceRepository` first), so a thread carrying a dangling
 * `workspaceId` is a state the product cannot reach — and seeding one made a real requirement look
 * like a test bug the first time something downstream read the path. Nested givens are the documented
 * shape for exactly this (`givenAppointment → givenClinicWithOwner → …`).
 */
export async function givenThread(testBed: TestBed, overrides: ThreadOverrides = {}): Promise<Thread> {
	const repo = testBed.resolve(ThreadRepository)
	const contactExternalId = overrides.contactExternalId ?? `contact-${Id.value()}`
	const workspaceId = overrides.workspaceId ?? (await givenWorkspace(testBed, { ownerId: overrides.ownerId })).id.value
	const thread = Thread.create({
		ownerId: overrides.ownerId ?? OPERATOR_ID,
		channelId: overrides.channelId ?? Id.value(),
		contactRef: {
			externalId: contactExternalId,
			displayName: overrides.contactDisplayName ?? 'Test Contact',
			kind: overrides.contactKind ?? ContactKind.USER,
		},
		workspaceId,
		providers: overrides.providers ?? [ProviderKind.CLAUDE_CODE],
		// MIRRORS PRODUCTION: `AttachThread` mints a tag and the gate is on from birth, so a helper that
		// seeded an ungated thread would let a suite prove an invocation path the product cannot reach.
		// The default is a fixed, tag-shaped constant rather than a mint over the temp workspace path —
		// tests assert against it by name, and a derived value would make every citation in the suite a
		// second implementation of `mintMentionTag`.
		mentionTag: overrides.mentionTag ?? GIVEN_MENTION_TAG,
		participants: overrides.participants ?? [
			{ participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true },
			{ participantId: contactExternalId, name: 'Test Contact', source: 'Channel contact', canInvoke: false },
		],
		bufferSize: overrides.bufferSize ?? BufferSize._50,
	})
	await repo.save(thread)
	return thread
}
