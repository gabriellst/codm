import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { ProviderKind, ContactKind, ProviderStatus } from '@codedm/contracts-typescript/wire/enums'
import { WorkspaceRepository } from '@workspace/repositories'
import { ProviderDetector } from '@agent/services/ProviderDetector'
import { Thread } from '../entities/Thread'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ChannelConnectivity } from '../services/ChannelConnectivity'
import { GroupMemberReader } from '../services/GroupMemberReader'
import { ThreadAttachedEvent } from '../events'
import type { ApplicationErrors } from '../errors'

export const AttachThreadInputSchema = z.object({
	ownerId: z.uuid(),
	contactRef: z.object({
		channelId: z.uuid(),
		externalId: z.string().min(1),
		displayName: z.string().min(1),
		kind: z.enum(ContactKind),
	}),
	workspaceId: z.uuid(),
	providers: z.array(z.enum(ProviderKind)).min(1),
})

export const AttachThreadOutputSchema = z.object({
	threadId: z.uuid(),
})

/**
 * C09 AttachThread — binds a contact/group to one workspace + one or more providers. Validates the
 * channel is CONNECTED, the workspace exists, and each provider is DETECTED; seeds participants
 * (operator as invoker, contact observing) and publishes `thread.attached` (→
 * `integration.thread.attached`, warming BC5 workspace indexing).
 */
@injectable()
export class AttachThread extends Handler<typeof AttachThreadInputSchema, typeof AttachThreadOutputSchema> {
	readonly name = 'attach_thread' as const
	readonly inputSchema = AttachThreadInputSchema
	readonly outputSchema = AttachThreadOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly workspaces: WorkspaceRepository,
		private readonly providerDetector: ProviderDetector,
		private readonly connectivity: ChannelConnectivity,
		private readonly groupMembers: GroupMemberReader,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		if (!(await this.connectivity.isConnected(input.contactRef.channelId))) {
			throw new BaseError<ApplicationErrors>('CHANNEL_NOT_CONNECTED', 'the channel is not connected')
		}

		const workspace = await this.workspaces.findById(input.workspaceId)
		if (!workspace || workspace.ownerId !== input.ownerId) {
			throw new BaseError<ApplicationErrors>('WORKSPACE_NOT_FOUND', `no workspace ${input.workspaceId}`)
		}

		for (const provider of input.providers) {
			const detection = await this.providerDetector.resolve(provider)
			if (!detection || detection.status !== ProviderStatus.DETECTED) {
				throw new BaseError<ApplicationErrors>('PROVIDER_NOT_DETECTED', `provider ${provider} is not installed`)
			}
		}

		const existing = await this.threads.findByChannelContact(input.contactRef.channelId, input.contactRef.externalId)
		if (existing) throw new BaseError<ApplicationErrors>('THREAD_ALREADY_ATTACHED', 'a thread already exists for this contact')

		// Seed the roster: the operator always invokes. For a 1:1 CONTACT the counterparty observes;
		// for a GROUP the roster is hydrated from the gateway `remote_memberships` read model (each
		// member observes), falling back to the group itself when the read model has no members yet.
		const participants: Parameters<typeof Thread.create>[0]['participants'] = [
			{ participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true },
		]
		if (input.contactRef.kind === ContactKind.GROUP) {
			const members = await this.groupMembers.listMembers(input.contactRef.channelId, input.contactRef.externalId)
			if (members.length > 0) {
				for (const m of members) {
					participants.push({ participantId: m.memberId, name: m.memberId, source: 'Channel group member', canInvoke: false })
				}
			} else {
				participants.push({ participantId: input.contactRef.externalId, name: input.contactRef.displayName, source: 'Channel group', canInvoke: false })
			}
		} else {
			participants.push({ participantId: input.contactRef.externalId, name: input.contactRef.displayName, source: 'Channel contact', canInvoke: false })
		}

		return this.withTransaction(tx, async tx => {
			const thread = Thread.create({
				ownerId: input.ownerId,
				channelId: input.contactRef.channelId,
				contactRef: { externalId: input.contactRef.externalId, displayName: input.contactRef.displayName, kind: input.contactRef.kind },
				workspaceId: input.workspaceId,
				providers: input.providers,
				participants,
			})
			await this.threads.save(thread, tx)

			await this.domainEventRepository.save(
				new ThreadAttachedEvent({
					entityId: thread.id.value,
					ownerId: input.ownerId,
					payload: {
						threadId: thread.id.value,
						channelId: thread.channelId,
						contactExternalId: thread.contactRef.externalId,
						contactDisplayName: thread.contactRef.displayName,
						contactKind: thread.contactRef.kind,
						workspaceId: thread.workspaceId,
						providers: thread.providers,
					},
				}),
				tx,
			)

			return { threadId: thread.id.value }
		})
	}
}
