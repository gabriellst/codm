import { injectable } from 'tsyringe-neo'
import { and, eq, like, inArray, isNull, sql } from 'drizzle-orm'
import { Handler, z, DrizzleClient, BaseError } from '@codm/core-typescript'
import type { BaseInterfaceErrors } from '@codm/core-typescript'
import type { z as zt } from 'zod'
import { channels, workspaces, threads, remotes, remoteMemberships } from '@codm/contracts/db'
import {
	ChannelKind,
	ChannelStatus,
	ContactKind,
	ProviderKind,
	ProviderStatus,
	WorkspaceBadge,
} from '@codm/contracts-typescript/wire/enums'
import { ProviderDetector } from '@agent/services/ProviderDetector'
// The LEAF, not the barrel: the barrel re-exports the runner implementations, whose graph reaches
// `agent/mcp/exposure.ts` → `@ui/controllers` → back here. See that barrel's header.
import { AgentRunnerFactory } from '@agent/services/AgentRunnerFactory/AgentRunnerFactory'

// One page of the contact directory. The picker paginates the gateway's remote read model by
// `lastMessageAt` (most-recently-active first), so the operator sees live conversations up top.
const CONTACTS_PAGE_SIZE = 30

const ContactOptionSchema = z.object({
	channelId: z.uuid(),
	externalId: z.string(),
	displayName: z.string(),
	kind: z.enum(ContactKind),
	/**
	 * Whether this contact has a photo — NOT the photo's url.
	 *
	 * It used to ship `avatarUrl` verbatim off the gateway projection, which is the PLATFORM's own url:
	 * signed, expiring, and blocked by the desktop shell's CSP (rail DSK-12 refuses to widen `img-src`
	 * to WhatsApp's CDN). No console ever rendered it, so the field was a hand-maintained copy of a
	 * secret that could not be used. The browser addresses the daemon's cached copy instead, through the
	 * SDK's generated query key for `GET /ui/avatars/:channelId/:remoteId` — `channelId` and
	 * `externalId` right above are that route's two halves.
	 */
	hasAvatar: z.boolean(),
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
	/**
	 * Selectable in the wizard: the binary is here AND this engine has a runner for it.
	 *
	 * It was `status === DETECTED` alone, which made an installed-but-undrivable CLI look offerable.
	 * `AttachThread` accepts such a pick — it only checks installation — so the failure surfaced a
	 * screen later as NOT_IMPLEMENTED out of `AgentRunnerFactory.for`, on a thread already created.
	 */
	available: z.boolean(),
	/** No runner class drives this CLI yet — the second axis, documented on `DetectProvidersOutputSchema`. */
	comingSoon: z.boolean(),
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
//
// `sk` is EPOCH MILLISECONDS (a number), not an ISO string: the column is
// `integer{ mode: 'timestamp_ms' }`, so the comparison is numeric. The cursor is opaque in the API
// but it IS handed to the client, so a cursor minted by an older build no longer decodes — see
// `decodeCursor`, which rejects it as a VALIDATION_ERROR instead of silently paging from the top.
interface ContactCursor {
	sk: number
	channelId: string
	remoteId: string
}

function encodeCursor(c: ContactCursor): string {
	return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url')
}

function decodeCursor(raw: string): ContactCursor {
	const invalid = () =>
		new BaseError<BaseInterfaceErrors>('VALIDATION_ERROR', 'Malformed contacts cursor — it was not minted by this build.')
	let parsed: ContactCursor
	try {
		parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as ContactCursor
	} catch {
		throw invalid()
	}
	// `sk` used to be an ISO string; a cursor from the pre-SQLite build still decodes as JSON and
	// would otherwise compare a string against an integer column and quietly return nothing.
	if (typeof parsed?.sk !== 'number' || typeof parsed?.channelId !== 'string' || typeof parsed?.remoteId !== 'string') {
		throw invalid()
	}
	return parsed
}

/**
 * Read — AttachThreadWizard (T15). Composes everything the attach flow needs in one BFF read (ui
 * context, spanning BC1/BC2/BC3/BC4):
 *   - channels        — the CONNECTED platform sessions a thread can ride on; `noChannelConnected`
 *                       is the up-front gate flag (empty → the wizard blocks).
 *   - contacts        — the operator's known counterparties, sourced from the gateway `remotes` read
 *                       model (name / photo presence / kind / lastMessageAt), server-side searchable and
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
		private readonly agentRunnerFactory: AgentRunnerFactory,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		// Every channel the operator owns (any status) scopes the contact directory; the CONNECTED
		// subset drives the attach gate + the channel picker.
		const ownerChannels = await this.db
			.select({ channelId: channels.id, kind: channels.platform, status: channels.status })
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
		// The runner-bearing set, from the wiring layer that owns it — never a list restated here.
		const drivable = this.agentRunnerFactory.supported
		const providers = detections.map(d => {
			const comingSoon = !drivable.includes(d.name)
			return {
				provider: d.name,
				status: d.status,
				available: d.status === ProviderStatus.DETECTED && !comingSoon,
				comingSoon,
				version: d.version,
			}
		})

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
		input: zt.infer<typeof GetAttachThreadWizardInputSchema>,
		ownerChannelIds: string[],
	): Promise<{ contacts: zt.infer<typeof GetAttachThreadWizardOutputSchema>['contacts']; contactsNextCursor: string | null }> {
		if (ownerChannelIds.length === 0) return { contacts: [], contactsNextCursor: null }

		// COALESCE nulls to the epoch so "most recent first" and the keyset stay uniform (null = oldest).
		// In this dialect the column is epoch-MILLISECONDS, so the epoch sentinel is literally `0`.
		const sortKey = sql<number>`COALESCE(${remotes.lastMessageAt}, 0)`

		const filters = [inArray(remotes.channelId, ownerChannelIds), isNull(remotes.deletedAt)]
		// Case-insensitive search. The Postgres case-insensitive LIKE operator does not exist in this
		// dialect — and, worse, drizzle's helper for it is declared dialect-NEUTRAL, so it compiles
		// clean against sqlite-core and only fails when the database rejects the operator at runtime.
		// SQLite's LIKE is already case-insensitive for ASCII, but the stored names are user data and
		// routinely non-ASCII, so both sides are lowered explicitly rather than relying on that.
		if (input.search?.trim()) {
			const term = `%${input.search.trim().toLowerCase()}%`
			filters.push(like(sql`lower(${remotes.name})`, term))
		}

		const cursor = input.cursor ? decodeCursor(input.cursor) : undefined
		if (cursor) {
			// Rows strictly after the cursor in (sortKey DESC, channelId ASC, remoteId ASC) order.
			// No casts: the comparison is numeric on sortKey and textual on the two ids, which is what
			// this dialect does natively. The tie-break tuple is unchanged.
			filters.push(
				sql`(
					${sortKey} < ${cursor.sk}
					OR (${sortKey} = ${cursor.sk} AND ${remotes.channelId} > ${cursor.channelId})
					OR (${sortKey} = ${cursor.sk} AND ${remotes.channelId} = ${cursor.channelId} AND ${remotes.remoteId} > ${cursor.remoteId})
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

		// `alreadyAttached` = a LIVE thread exists for (channel, contact) on this owner.
		//
		// The `deletedAt` filter is AC-5's PRECONDITION, not decoration (thread-deletion spec, decision 5):
		// counting an apagada thread here would leave its contact flagged "já anexado" in the only screen
		// that can re-attach it, so the revive decision 4 promises would be unreachable from the UI while
		// the conversation stays invisible everywhere else.
		const threadRows = await this.db
			.select({ channelId: threads.channelId, externalId: threads.contactExternalId })
			.from(threads)
			.where(and(eq(threads.ownerId, input.ownerId), isNull(threads.deletedAt)))
		const attachedKeys = new Set(threadRows.map(t => `${t.channelId}:${t.externalId}`))

		// One grouped count for every GROUP remote on the page (no N+1).
		const groupRemoteIds = page.filter(r => r.type === ContactKind.GROUP).map(r => r.remoteId)
		const memberCounts = new Map<string, number>()
		if (groupRemoteIds.length > 0) {
			const counts = await this.db
				.select({ channelId: remoteMemberships.channelId, groupId: remoteMemberships.groupId, count: sql<number>`count(*)` })
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
			hasAvatar: Boolean(r.avatarUrl),
			lastMessageAt: r.lastMessageAt ? new Date(r.lastMessageAt).toISOString() : null,
			participantCount: r.type === ContactKind.GROUP ? (memberCounts.get(`${r.channelId}:${r.remoteId}`) ?? 0) : null,
			alreadyAttached: attachedKeys.has(`${r.channelId}:${r.remoteId}`),
		}))

		const last = page.at(-1)
		const contactsNextCursor =
			hasMore && last ? encodeCursor({ sk: Number(last.sortKey), channelId: last.channelId, remoteId: last.remoteId }) : null

		return { contacts, contactsNextCursor }
	}
}
