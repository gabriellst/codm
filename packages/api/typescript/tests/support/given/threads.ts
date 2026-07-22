// Thread given helper — sets up a Thread via the repository directly (never the use case).
import type { TestBed } from '../TestBed'
import { Id } from '@template/core-typescript'
import { ProviderKind, ContactKind, BufferSize } from '@template/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { Thread } from '@thread/entities/Thread'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'

type ThreadOverrides = Partial<{
	ownerId: string
	channelId: string
	contactExternalId: string
	contactDisplayName: string
	contactKind: ContactKind
	workspaceId: string
	providers: ProviderKind[]
	bufferSize: BufferSize
}>

export async function givenThread(testBed: TestBed, overrides: ThreadOverrides = {}): Promise<Thread> {
	const repo = testBed.resolve(ThreadRepository)
	const contactExternalId = overrides.contactExternalId ?? `contact-${Id.value()}`
	const thread = Thread.create({
		ownerId: overrides.ownerId ?? OPERATOR_ID,
		channelId: overrides.channelId ?? Id.value(),
		contactRef: {
			externalId: contactExternalId,
			displayName: overrides.contactDisplayName ?? 'Test Contact',
			kind: overrides.contactKind ?? ContactKind.CONTACT,
		},
		workspaceId: overrides.workspaceId ?? Id.value(),
		providers: overrides.providers ?? [ProviderKind.CLAUDE_CODE],
		participants: [
			{ participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true },
			{ participantId: contactExternalId, name: 'Test Contact', source: 'Channel contact', canInvoke: false },
		],
		bufferSize: overrides.bufferSize ?? BufferSize._50,
	})
	await repo.save(thread)
	return thread
}
