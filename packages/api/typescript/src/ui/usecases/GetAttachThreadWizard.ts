import { injectable } from 'tsyringe-neo'
import { and, eq } from 'drizzle-orm'
import { Handler, z, DrizzleClient } from '@codedm/core-typescript'
import { channels, workspaces, threads } from '@codedm/contracts/db'
import {
	ChannelKind,
	ChannelStatus,
	ContactKind,
	ProviderKind,
	ProviderStatus,
	WorkspaceBadge,
} from '@codedm/contracts-typescript/wire/enums'
import { ProviderDetector } from '@terminal/services/ProviderDetector'

const ContactOptionSchema = z.object({
	channelId: z.uuid(),
	externalId: z.string(),
	displayName: z.string(),
	kind: z.enum(ContactKind),
	// True when this (channel, contact) already has a thread — the UI flags it so the operator
	// doesn't double-attach (AttachThread rejects THREAD_ALREADY_ATTACHED).
	alreadyAttached: z.boolean(),
})

const WorkspaceOptionSchema = z.object({
	workspaceId: z.uuid(),
	path: z.string(),
	badges: z.array(z.enum(WorkspaceBadge)),
})

const ProviderOptionSchema = z.object({
	provider: z.enum(ProviderKind),
	status: z.enum(ProviderStatus),
	available: z.boolean(),
	version: z.string().optional(),
})

export const GetAttachThreadWizardInputSchema = z.object({ ownerId: z.uuid() })
export const GetAttachThreadWizardOutputSchema = z.object({
	// True when NO channel is CONNECTED — the wizard blocks with a "connect a channel first" gate.
	noChannelConnected: z.boolean(),
	channels: z.array(z.object({ channelId: z.uuid(), kind: z.enum(ChannelKind) })),
	contacts: z.array(ContactOptionSchema),
	workspaces: z.array(WorkspaceOptionSchema),
	providers: z.array(ProviderOptionSchema),
})

/**
 * Read — AttachThreadWizard (T15). Composes everything the attach flow needs in one BFF read (ui
 * context, spanning BC1/BC2/BC3/BC4):
 *   - channels        — the CONNECTED platform sessions a thread can ride on; `noChannelConnected`
 *                       is the up-front gate flag (empty → the wizard blocks).
 *   - contacts        — the known channel counterparties, each flagged `alreadyAttached` so the
 *                       operator can't double-attach one that already has a thread.
 *   - workspaces      — the registered project folders to bind.
 *   - providers       — per-CLI availability (the detection Service probe) to pick from.
 * A pure composition read (no aggregate orchestration) — the BFF pattern.
 */
@injectable()
export class GetAttachThreadWizard extends Handler<typeof GetAttachThreadWizardInputSchema, typeof GetAttachThreadWizardOutputSchema> {
	readonly name = 'get_attach_thread_wizard' as const
	readonly inputSchema = GetAttachThreadWizardInputSchema
	readonly outputSchema = GetAttachThreadWizardOutputSchema

	constructor(
		private readonly db: DrizzleClient,
		private readonly providerDetector: ProviderDetector,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const connectedChannels = await this.db
			.select({ channelId: channels.id, kind: channels.kind })
			.from(channels)
			.where(and(eq(channels.ownerId, input.ownerId), eq(channels.status, ChannelStatus.CONNECTED)))

		const workspaceRows = await this.db
			.select({ workspaceId: workspaces.id, path: workspaces.path, badges: workspaces.badges })
			.from(workspaces)
			.where(eq(workspaces.ownerId, input.ownerId))

		const threadRows = await this.db
			.select({
				channelId: threads.channelId,
				externalId: threads.contactExternalId,
				displayName: threads.contactDisplayName,
				kind: threads.contactKind,
			})
			.from(threads)
			.where(eq(threads.ownerId, input.ownerId))

		// The known address book = the contacts already on the operator's threads. `alreadyAttached`
		// is computed against that same set (a thread exists), so the flag stays correct if the
		// contact source later widens to a live channel directory.
		const attachedKeys = new Set(threadRows.map(t => `${t.channelId}:${t.externalId}`))
		const contacts = threadRows.map(t => ({
			channelId: t.channelId,
			externalId: t.externalId,
			displayName: t.displayName,
			kind: t.kind as ContactKind,
			alreadyAttached: attachedKeys.has(`${t.channelId}:${t.externalId}`),
		}))

		const detections = await this.providerDetector.detect()
		const providers = detections.map(d => ({
			provider: d.name,
			status: d.status,
			available: d.status === ProviderStatus.DETECTED,
			version: d.version,
		}))

		return {
			noChannelConnected: connectedChannels.length === 0,
			channels: connectedChannels.map(c => ({ channelId: c.channelId, kind: c.kind as ChannelKind })),
			contacts,
			workspaces: workspaceRows.map(w => ({ workspaceId: w.workspaceId, path: w.path, badges: w.badges as WorkspaceBadge[] })),
			providers,
		}
	}
}
