import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { ProviderKind, ContactKind, ProviderStatus } from '@codm/contracts-typescript/wire/enums'
import { WorkspaceRepository } from '@workspace/repositories/WorkspaceRepository'
import { ProviderDetector } from '@agent/services/ProviderDetector'
// The LEAF, not the barrel — the barrel pulls the runner implementations, whose graph reaches
// `agent/mcp/exposure.ts` → `@ui/controllers`. See that barrel's header.
import { AgentRunnerFactory } from '@agent/services/AgentRunnerFactory/AgentRunnerFactory'
import { OPERATOR_PARTICIPANT_ID, Thread } from '../entities/Thread'
import { mintMentionTag } from '../schemas'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ChannelConnectivity } from '../services/ChannelConnectivity'
import { GroupMemberReader } from '../services/GroupMemberReader'
import { ThreadAttachedEvent } from '../events/ThreadAttachedEvent'
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
 * channel is CONNECTED, the workspace exists, and each provider is both DETECTED and DRIVABLE; seeds
 * participants (operator as invoker, contact observing) and publishes `thread.attached` (→
 * `integration.thread.attached`, warming BC5 workspace indexing).
 *
 * ### Why TWO provider questions, and why this is the place both are asked
 * "Is the binary installed" and "can this engine drive it" are different axes, and only the first was
 * ever asked here. `PROVIDER_BINARIES` declares real `bin` names for codex and opencode so they appear
 * honestly in `DetectProviders`, so a machine with the codex CLI on PATH passed detection cleanly and
 * the thread was created declaring `providers: ['CODEX']` — the failure then surfaced a screen later,
 * inside a conversation the operator had already made, as an infrastructure `NOT_IMPLEMENTED` out of
 * `AgentRunnerFactory.for`. `comingSoon` (commit 8721a9b8) stopped the WIZARD from offering such a
 * provider; this closes the WRITE, which is the door the wizard is only a sign on — the endpoint takes
 * a `providers` array from anyone who can reach it, and a stale screen can still post one.
 *
 * The drivable set is READ FROM THE FACTORY (`supported`), never restated as a literal here. That is
 * the entire reason `AgentRunnerFactory.supported` is derived from the same map `for()` consults: this
 * guard and the runtime resolution cannot disagree, so widening one widens the other. Same source the
 * three read models already use for `comingSoon`.
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
		private readonly runners: AgentRunnerFactory,
		private readonly connectivity: ChannelConnectivity,
		private readonly groupMembers: GroupMemberReader,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		if (!(await this.connectivity.isConnected(input.contactRef.channelId))) {
			throw new BaseError<ApplicationErrors>('CHANNEL_NOT_CONNECTED', 'the channel is not connected')
		}

		// `tx` PASSED: a caller composing this into its own transaction (e.g. `CompleteOnboarding`,
		// which creates the workspace via `AddWorkspace` and hands its id straight here) may reach
		// this lookup before that workspace row is committed. Reading through the ambient connection
		// (no `tx`) would miss it — a plain `SELECT` on another connection cannot see an in-flight
		// transaction's writes.
		const workspace = await this.workspaces.findById(input.workspaceId, tx)
		if (!workspace || workspace.ownerId !== input.ownerId) {
			throw new BaseError<ApplicationErrors>('WORKSPACE_NOT_FOUND', `no workspace ${input.workspaceId}`)
		}

		// The drivable set, from the wiring layer that owns it. Read ONCE outside the loop: it is a
		// property of the bound factory, not of the provider being examined.
		const drivable = this.runners.supported
		for (const provider of input.providers) {
			const detection = await this.providerDetector.resolve(provider)
			if (!detection || detection.status !== ProviderStatus.DETECTED) {
				throw new BaseError<ApplicationErrors>('PROVIDER_NOT_DETECTED', `provider ${provider} is not installed`)
			}
			// NOT-INSTALLED is reported BEFORE CANNOT-DRIVE, the same order `RunIssueTurn.resolveProvider`
			// keeps: an operator missing the binary is told to install it, rather than told the product
			// does not support their CLI.
			if (!drivable.includes(provider)) {
				throw new BaseError<ApplicationErrors>(
					'PROVIDER_COMING_SOON',
					`provider ${provider} is installed but not drivable yet — this engine has no AgentRunner for it (it can drive ${drivable.join(', ')})`,
				)
			}
		}

		// A LIVE thread for this contact is still a conflict. A DELETED one is the re-attach the operator
		// just asked for (thread-deletion spec, decision 4) — see the revive branch below.
		const existing = await this.threads.findByChannelContact(input.contactRef.channelId, input.contactRef.externalId)
		if (existing && !existing.deletedAt)
			throw new BaseError<ApplicationErrors>('THREAD_ALREADY_ATTACHED', 'a thread already exists for this contact')

		// Seed the roster: the operator always invokes. For a 1:1 CONTACT the counterparty observes;
		// for a GROUP the roster is hydrated from the gateway `remote_memberships` read model (each
		// member observes), falling back to the group itself when the read model has no members yet.
		const participants: Parameters<typeof Thread.create>[0]['participants'] = [
			{ participantId: OPERATOR_PARTICIPANT_ID, name: 'Operator', source: 'Operator on this machine', canInvoke: true },
		]
		if (input.contactRef.kind === ContactKind.GROUP) {
			const members = await this.groupMembers.listMembers(input.contactRef.channelId, input.contactRef.externalId)
			if (members.length > 0) {
				for (const m of members) {
					participants.push({ participantId: m.memberId, name: m.memberId, source: 'Channel group member', canInvoke: false })
				}
			} else {
				participants.push({
					participantId: input.contactRef.externalId,
					name: input.contactRef.displayName,
					source: 'Channel group',
					canInvoke: false,
				})
			}
		} else {
			participants.push({
				participantId: input.contactRef.externalId,
				name: input.contactRef.displayName,
				source: 'Channel contact',
				canInvoke: false,
			})
		}

		return this.withTransaction(tx, async tx => {
			const contactRef = {
				externalId: input.contactRef.externalId,
				displayName: input.contactRef.displayName,
				kind: input.contactRef.kind,
			}
			const settings = {
				contactRef,
				workspaceId: input.workspaceId,
				providers: input.providers,
				mentionTag: mintMentionTag(workspace.path),
				participants,
			}

			/**
			 * REVIVE, don't recreate (thread-deletion spec, decision 4).
			 *
			 * `Thread.create` here would mint a new id and insert — straight into
			 * `threads_owner_channel_contact_unq`, because the deleted row never left. Reviving in place is
			 * also what makes the decision's promise true: the transcript hangs off THIS id, so re-attaching
			 * the same contact returns the same conversation rather than an empty one beside it.
			 *
			 * Everything else below is unchanged, and deliberately so: the revived thread publishes
			 * `thread.attached` exactly like a new one. Downstream (BC5 workspace indexing) cares that this
			 * conversation is now bound to this workspace, which is equally true either way — and the new
			 * binding may well be a DIFFERENT workspace than the one it had before it was deleted.
			 */
			const thread = existing ?? Thread.create({ ownerId: input.ownerId, channelId: input.contactRef.channelId, ...settings })
			if (existing) existing.revive(settings)
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
