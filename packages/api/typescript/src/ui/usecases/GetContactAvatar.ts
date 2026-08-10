import { injectable } from 'tsyringe-neo'
import { and, eq } from 'drizzle-orm'
import { DrizzleDatabaseDriver, Handler, z, BaseError } from '@codm/core-typescript'
import { channels, remotes } from '@codm/contracts/db'
import { ContactAvatarStore } from '../services/ContactAvatarStore'
import type { ApplicationErrors } from '../errors'

export const GetContactAvatarInputSchema = z.object({
	ownerId: z.uuid(),
	channelId: z.uuid(),
	/** The platform's own id for the contact (a WhatsApp JID) — opaque here, never parsed. */
	remoteId: z.string().min(1),
})

/**
 * The bytes + their media type. Not a path (which is what `GetArtifactContent` returns), because the
 * file this resolves to is a CACHE the port owns: the doubles bound in `mock`/`integration` have no
 * disk to name, and a port whose contract is "a path on disk" cannot be substituted by one that
 * doesn't touch a disk.
 */
export const GetContactAvatarOutputSchema = z.object({
	// `z.custom` and not `z.instanceof(Uint8Array)`: the latter infers through `InstanceType`, which
	// erases the buffer parameter this seam depends on (see `ContactAvatarBytes`). Nothing parses
	// this schema at runtime anyway — a use case's output is a TYPE contract, `Handler.execute`
	// validates only the input — so the honest move is to name the type rather than declare a check
	// that never runs.
	bytes: z.custom<Uint8Array<ArrayBuffer>>(),
	contentType: z.string(),
})

/**
 * Read — the photo of one contact, for the console's chat bubbles and rosters.
 *
 * ### The owner gate, and why it takes this exact path
 * `gateway_remotes` HAS NO `owner_id`. It is a child projection of the channel, scoped by
 * `channel_id` alone (the medscall shape the Go gateway mirrors). So the only thing that makes a
 * remote "the operator's" is the channel it hangs off:
 *
 *     remotes.channel_id → channels.id → channels.owner_id
 *
 * That join is the ENTIRE authorization, and it is checked FIRST — before the remote is even looked
 * up. A read that fetched the remote and then compared owners would still be correct, but the
 * ordering here means an unowned channel never causes a row of somebody else's contact book to be
 * loaded into this process at all.
 *
 * ### One code for every absence
 * Unknown channel, another owner's channel, a remote that is not in it, a remote with no photo, and
 * a photo the origin will not hand over all answer `CONTACT_AVATAR_NOT_FOUND`. The console does the
 * same thing for all five — draws the contact's initials — and telling the caller which of the five
 * it hit would only enumerate whose channels exist.
 */
@injectable()
export class GetContactAvatar extends Handler<typeof GetContactAvatarInputSchema, typeof GetContactAvatarOutputSchema> {
	readonly name = 'get_contact_avatar' as const
	readonly inputSchema = GetContactAvatarInputSchema
	readonly outputSchema = GetContactAvatarOutputSchema

	constructor(
		private readonly driver: DrizzleDatabaseDriver,
		private readonly avatars: ContactAvatarStore,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const missing = () =>
			new BaseError<ApplicationErrors>('CONTACT_AVATAR_NOT_FOUND', `no avatar for remote ${input.remoteId} on channel ${input.channelId}`)

		const [channel] = await this.driver.db
			.select({ id: channels.id })
			.from(channels)
			.where(and(eq(channels.id, input.channelId), eq(channels.ownerId, input.ownerId)))
			.limit(1)
		if (!channel) throw missing()

		const [remote] = await this.driver.db
			.select({ avatarUrl: remotes.avatarUrl })
			.from(remotes)
			.where(and(eq(remotes.channelId, input.channelId), eq(remotes.remoteId, input.remoteId)))
			.limit(1)
		if (!remote?.avatarUrl) throw missing()

		const avatar = await this.avatars.get(remote.avatarUrl)
		if (!avatar) throw missing()

		return { bytes: avatar.bytes, contentType: avatar.contentType }
	}
}
