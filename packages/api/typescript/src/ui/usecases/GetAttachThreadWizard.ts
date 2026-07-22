import { injectable } from 'tsyringe-neo'
import { and, eq, ilike, inArray, isNull, sql } from 'drizzle-orm'
import { Handler, z, DrizzleClient } from '@codedm/core-typescript'
import { channels, workspaces, threads, remotes, remoteMemberships } from '@codedm/contracts/db'
import {
	ChannelKind,
	ChannelStatus,
	ContactKind,
	ProviderKind,
	ProviderStatus,
	WorkspaceBadge,
} from '@codedm/contracts-typescript/wire/enums'
import { ProviderDetector } from '@terminal/services/ProviderDetector'

// One page of the contact directory. The picker paginates the gateway's remote read model by
// `lastMessageAt` (most-recently-active first), so the operator sees live conversations up top.
const CONTACTS_PAGE_SIZE = 30

const ContactOptionSchema = z.object({
	channelId: z.uuid(),
	externalId: z.string(),
	displayName: z.string(),
	kind: z.enum(ContactKind),
	// Avatar from the gateway remote projection (medscall parity: null when the platform has none yet).
	avatarUrl: z.string().nullable(),
	// Last inbound/outbound activity — drives the "most recent first" order and a UI timestamp.
	lastMessageAt: z.string().nullable(),
	// Member count for GROUP remotes (from remote_memberships); null for 1:1 CONTACT/BROADCAST.
	participantCount: z.number().int().nullable(),
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

export const GetAttachThreadWizardInputSchema = z.object({
	ownerId: z.uuid(),
	// Server-side contact search (name substring, case-insensitive). Optional — the first load omits it.
	search: z.string().optional(),
	// Opaque keyset cursor from a previous page's `contactsNextCursor`. Optional — omitted for page 1.
	cursor: z.string().optional(),
})
export const GetAttachThreadWizardOutputSchema = z.object({
	// True when NO channel is CONNECTED — the wizard blocks with a "connect a channel first" gate.
	noChannelConnected: z.boolean(),
	channels: z.array(z.object({ channelId: z.uuid(), kind: z.enum(ChannelKind) })),
	contacts: z.array(ContactOptionSchema),
	// Opaque cursor for the next contacts page, or null when the current page is the last.
	contactsNextCursor: z.string().nullable(),
	workspaces: z.array(WorkspaceOptionSchema),
	providers: z.array(ProviderOptionSchema),
})

// Keyset cursor — the (sortKey, channelId, remoteId) triple of the last row on a page. `sortKey`
// coalesces a null lastMessageAt to the epoch so nulls sort last uniformly (no NULLS-LAST keyset math).
interface ContactCursor {
	sk: string
	channelId: string
	remoteId: string
}

function encodeCursor(c: ContactCursor): string {
	return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url')
}

function decodeCursor(raw: string): ContactCursor | undefined {
	try {
		const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as ContactCursor
		if (typeof parsed.sk === 'string' && typeof parsed.channelId === 'string' && typeof parsed.remoteId === 'string') return parsed
		return undefined
	} catch {
		return undefined
	}
}

/**
 * Read — AttachThreadWizard (T15). Composes everything the attach flow needs in one BFF read (ui
 * context, spanning BC1/BC2/BC3/BC4):
 *   - channels        — the CONNECTED platform sessions a thread can ride on; `noChannelConnected`
 *                       is the up-front gate flag (empty → the wizard blocks).
 *   - contacts        — the operator's known counterparties, sourced from the gateway `remotes` read
 *                       model (name / avatar / kind / lastMessageAt), server-side searchable and
 *                       keyset-paginated most-recent-first. Each is flagged `alreadyAttached` so the
 *                       operator can't double-attach one that already has a thread; GROUP remotes
 *                       carry a `participantCount` from `remote_memberships`.
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
		// Every channel the operator owns (any status) scopes the contact directory; the CONNECTED
		// subset drives the attach gate + the channel picker.
		const ownerChannels = await this.db
			.select({ channelId: channels.id, kind: channels.kind, status: channels.status })
			.from(channels)
			.where(eq(channels.ownerId, input.ownerId))

		const ownerChannelIds = ownerChannels.map(c => c.channelId)
		const connectedChannels = ownerChannels.filter(c => c.status === ChannelStatus.CONNECTED)

		const workspaceRows = await this.db
			.select({ workspaceId: workspaces.id, path: workspaces.path, badges: workspaces.badges })
			.from(workspaces)
			.where(eq(workspaces.ownerId, input.ownerId))

		const { contacts, contactsNextCursor } = await this.loadContacts(input, ownerChannelIds)

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
			contactsNextCursor,
			workspaces: workspaceRows.map(w => ({ workspaceId: w.workspaceId, path: w.path, badges: w.badges as WorkspaceBadge[] })),
			providers,
		}
	}

	private async loadContacts(
		input: this['input'],
		ownerChannelIds: string[],
	): Promise<{ contacts: this['output']['contacts']; contactsNextCursor: string | null }> {
		if (ownerChannelIds.length === 0) return { contacts: [], contactsNextCursor: null }

		// COALESCE nulls to the epoch so "most recent first" and the keyset stay uniform (null = oldest).
		const sortKey = sql<string>`COALESCE(${remotes.lastMessageAt}, 'epoch'::timestamptz)`

		const filters = [inArray(remotes.channelId, ownerChannelIds), isNull(remotes.deletedAt)]
		if (input.search?.trim()) filters.push(ilike(remotes.name, `%${input.search.trim()}%`))

		const cursor = input.cursor ? decodeCursor(input.cursor) : undefined
		if (cursor) {
			// Rows strictly after the cursor in (sortKey DESC, channelId ASC, remoteId ASC) order.
			filters.push(
				sql`(
					${sortKey} < ${cursor.sk}::timestamptz
					OR (${sortKey} = ${cursor.sk}::timestamptz AND ${remotes.channelId} > ${cursor.channelId}::uuid)
					OR (${sortKey} = ${cursor.sk}::timestamptz AND ${remotes.channelId} = ${cursor.channelId}::uuid AND ${remotes.remoteId} > ${cursor.remoteId})
				)`,
			)
		}

		const rows = await this.db
			.select({
				channelId: remotes.channelId,
				remoteId: remotes.remoteId,
				name: remotes.name,
				type: remotes.type,
				avatarUrl: remotes.avatarUrl,
				lastMessageAt: remotes.lastMessageAt,
				sortKey,
			})
			.from(remotes)
			.where(and(...filters))
			.orderBy(sql`${sortKey} DESC`, remotes.channelId, remotes.remoteId)
			.limit(CONTACTS_PAGE_SIZE + 1)

		const hasMore = rows.length > CONTACTS_PAGE_SIZE
		const page = hasMore ? rows.slice(0, CONTACTS_PAGE_SIZE) : rows

		// `alreadyAttached` = a thread already exists for (channel, contact) on this owner.
		const threadRows = await this.db
			.select({ channelId: threads.channelId, externalId: threads.contactExternalId })
			.from(threads)
			.where(eq(threads.ownerId, input.ownerId))
		const attachedKeys = new Set(threadRows.map(t => `${t.channelId}:${t.externalId}`))

		// One grouped count for every GROUP remote on the page (no N+1).
		const groupRemoteIds = page.filter(r => r.type === ContactKind.GROUP).map(r => r.remoteId)
		const memberCounts = new Map<string, number>()
		if (groupRemoteIds.length > 0) {
			const counts = await this.db
				.select({ channelId: remoteMemberships.channelId, groupId: remoteMemberships.groupId, count: sql<number>`count(*)::int` })
				.from(remoteMemberships)
				.where(and(inArray(remoteMemberships.channelId, ownerChannelIds), inArray(remoteMemberships.groupId, groupRemoteIds)))
				.groupBy(remoteMemberships.channelId, remoteMemberships.groupId)
			for (const c of counts) memberCounts.set(`${c.channelId}:${c.groupId}`, c.count)
		}

		const contacts = page.map(r => ({
			channelId: r.channelId,
			externalId: r.remoteId,
			displayName: r.name,
			kind: r.type as ContactKind,
			avatarUrl: r.avatarUrl,
			lastMessageAt: r.lastMessageAt ? new Date(r.lastMessageAt).toISOString() : null,
			participantCount: r.type === ContactKind.GROUP ? (memberCounts.get(`${r.channelId}:${r.remoteId}`) ?? 0) : null,
			alreadyAttached: attachedKeys.has(`${r.channelId}:${r.remoteId}`),
		}))

		const last = page.at(-1)
		const contactsNextCursor =
			hasMore && last ? encodeCursor({ sk: new Date(last.sortKey).toISOString(), channelId: last.channelId, remoteId: last.remoteId }) : null

		return { contacts, contactsNextCursor }
	}
}
