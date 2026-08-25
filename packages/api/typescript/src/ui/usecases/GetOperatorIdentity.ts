import { injectable } from 'tsyringe-neo'
import { and, desc, eq, ne } from 'drizzle-orm'
import { LibSqlDatabaseDriver, Handler, z } from '@codm/core-typescript'
import { channels, remotes } from '@codm/contracts/db'
import { ChannelStatus } from '@codm/contracts-typescript/wire/enums'

/**
 * WHO THE OPERATOR IS, ON SCREEN — the same four facts every other face on this console carries
 * (`GetSessionChat.sender`, `GetHomeDashboard.threads`, `GetThreadSettings.participants`), so the
 * header renders through the SAME `contactAvatarUrl(channelId, externalId)` the rosters do.
 *
 * `hasAvatar` rather than a url, for the reason documented at length on `GetSessionChat.sender`: the
 * platform's own url is signed, expiring and off-CSP, and the route belongs to the SDK's generated
 * query key — a url on the wire would be a second, hand-maintained copy of it.
 */
const BorrowedIdentitySchema = z.object({
	channelId: z.uuid(),
	externalId: z.string(),
	displayName: z.string(),
	hasAvatar: z.boolean(),
})

export const GetOperatorIdentityInputSchema = z.object({ ownerId: z.uuid() })

export const GetOperatorIdentityOutputSchema = z.object({
	/**
	 * ABSENT is a first-class answer, not an error: no channel paired yet, the channel disconnected,
	 * `owner_remote_id` still `''` (its column default), or the account's own JID not yet written into
	 * the contact book. All four mean "there is no identity to borrow right now", and the console does
	 * one thing for all four — falls back to the constant operator session it already holds.
	 *
	 * DELIBERATE DEVIATION FROM query `bp-09` ("a read that misses throws NOT_FOUND"). That rule is
	 * about fetching an entity BY ID, where a miss means the caller asked for something that does not
	 * exist. Nothing was asked for by id here: this read answers "is there an identity to borrow?",
	 * and "no" is the state of a freshly installed app before the first pairing. Throwing would make
	 * the header 404 on the most normal screen in the product.
	 */
	identity: BorrowedIdentitySchema.optional(),
})

/**
 * Read — the operator's DISPLAYED identity (name + face), BORROWED from the connected channel.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * ### The decision, and why it has an expiry date (founder, 2026-08-07)
 * CODM has no accounts: `CloudSessionMiddleware` stamps a CONSTANT identity (`OPERATOR_SESSION` — name
 * `"Operator"`, no picture) and `GetSession` echoes it. So the header's avatar was structurally
 * empty — there was no field for a picture anywhere on the session, and adding one to `SessionSchema`
 * would be inventing an account the product does not have.
 *
 * What the product DOES have is a paired WhatsApp account: `gateway_channels.owner_remote_id` holds
 * the JID of the account the gateway logged in as, and `gateway_remotes` already carries that JID's
 * real name and photo — the same contact book every other face on this console is drawn from. So the
 * app WEARS THE CHANNEL'S IDENTITY.
 *
 * **This is a loan, and the terms are these:**
 * 1. **Disconnect the channel and the operator loses their name and face.** By design — the identity
 *    was never the app's. The console falls back to the constant session (`"Operator"` + initials).
 * 2. **A SECOND connected channel makes "the owner" ambiguous.** Today the query takes the most
 *    recently updated connected channel; with two paired accounts that is an arbitrary winner, not an
 *    answer. THAT is the review trigger: the moment multi-channel ships, this read must either become
 *    a per-channel identity the header switches between, or be retired in favour of (3).
 * 3. **The way out already exists, half-built:** `owner_owners.picture_url` (a real column, null in
 *    every row today) plus the `AvatarUploader` in
 *    `app/react/src/routes/(app)/settings/account/-components/AvatarUploader/`. When the operator can
 *    upload their own picture, this read stops being the source and becomes at most a default.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * ### Why a new read in `ui` and not a field on the session
 * `SessionSchema` lives in the `auth` context and describes the operator collapse — a constant with
 * no database behind it. Hanging a channel-derived picture off it would make `auth` read
 * `gateway_channels`, i.e. a cross-context table read for a purely presentational fact, and would put
 * a value that changes (the channel connects, the contact renames themselves) inside a schema whose
 * whole point is that it does not. This is a BFF read of a specific screen region — the definition of
 * a query use case in the `ui` context — so it lives here, beside `GetUserInfo`, and the session seam
 * stays constant.
 */
@injectable()
export class GetOperatorIdentity extends Handler<typeof GetOperatorIdentityInputSchema, typeof GetOperatorIdentityOutputSchema> {
	readonly name = 'get_operator_identity' as const
	readonly inputSchema = GetOperatorIdentityInputSchema
	readonly outputSchema = GetOperatorIdentityOutputSchema

	constructor(private readonly driver: LibSqlDatabaseDriver) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		// CONNECTED and carrying a stored session, in one predicate — the same pair the Go gateway's own
		// `ListReconnectable` query uses (`status = CONNECTED AND owner_remote_id != ''`), because the two
		// facts are separable: a channel can be marked connected before the pairing writes the JID, and a
		// row keeps the JID after it disconnects. Either alone would hand the header half an identity.
		const [channel] = await this.driver.db
			.select({ id: channels.id, ownerRemoteId: channels.ownerRemoteId })
			.from(channels)
			.where(and(eq(channels.ownerId, input.ownerId), eq(channels.status, ChannelStatus.CONNECTED), ne(channels.ownerRemoteId, '')))
			// Most recently updated wins. With ONE paired account — the only shape this product supports
			// today — the ordering never decides anything; with two it decides arbitrarily, which is the
			// review trigger spelled out in the class docblock above.
			.orderBy(desc(channels.updatedAt))
			.limit(1)
		if (!channel) return {}

		// The account's OWN row in the contact book, on the same `(channel_id, remote_id)` key the avatar
		// endpoint walks — so `contactAvatarUrl(channelId, externalId)` on the console resolves through
		// `GetContactAvatar` with no second path to keep in sync. The channel is already owner-gated
		// above, and `gateway_remotes` carries no owner of its own, so that gate covers this row too.
		const [remote] = await this.driver.db
			.select({ name: remotes.name, avatarUrl: remotes.avatarUrl })
			.from(remotes)
			.where(and(eq(remotes.channelId, channel.id), eq(remotes.remoteId, channel.ownerRemoteId)))
			.limit(1)
		// No contact-book row ⇒ nothing to borrow. The JID is technically available here, but
		// `5511900000006@s.whatsapp.net` in the header is not an identity — the constant `"Operator"` the
		// console already falls back to reads better and says the same amount.
		if (!remote) return {}

		return {
			identity: {
				channelId: channel.id,
				externalId: channel.ownerRemoteId,
				// `||`, not `??`: `gateway_remotes.name` is `NOT NULL DEFAULT ''`, so a synced-but-unnamed
				// contact stores the empty string — which `??` would accept as a name and render as a blank
				// header. Same rule `GetThreadSettings` applies to the roster.
				displayName: remote.name || channel.ownerRemoteId,
				hasAvatar: Boolean(remote.avatarUrl),
			},
		}
	}
}
