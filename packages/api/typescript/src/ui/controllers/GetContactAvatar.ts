import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, MimeTypes, z } from '@codm/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { GetContactAvatar, GetContactAvatarInputSchema } from '../usecases/GetContactAvatar'

export const GetContactAvatarControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		params: GetContactAvatarInputSchema.pick({ channelId: true, remoteId: true }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { channelId: '019e4d24-6524-7041-9e1c-8108180cddae', remoteId: '5511999999999@s.whatsapp.net' },
		},
	])

/**
 * The LOGICAL payload is an image's bytes, which Zod cannot describe — same posture as
 * `GetArtifactContent`, whose schema says the same thing for the same reason. The SDK's only job for
 * this operation is to hand the console the URL (via the generated query key); nothing calls the
 * generated hook, because an `<img src>` is not a `fetch`.
 */
export const GetContactAvatarControllerOutputSchema = z.string().example(['<binary>'])

/**
 * The photo of one contact, addressed by (channel, remote), for the browser.
 *
 * ### Why the daemon serves this instead of the CDN
 * `gateway_remotes.avatar_url` is a signed `pps.whatsapp.net` url. The console's CSP does not list
 * that origin and deliberately never will: every avatar the browser drew would announce the
 * operator's IP to Meta, and the signature expires anyway, so the link would rot in place. The
 * daemon fetches once and caches under the data dir (`ContactAvatarStore`) — one origin the console
 * already trusts, no expiry the product can't see.
 *
 * ### Addressed by (channel, remote), not by transcript entry
 * The same person speaks many times in a conversation and appears in many conversations. Keyed this
 * way the browser's own HTTP cache serves every repeat; keyed by entry it would refetch the same
 * face once per bubble.
 *
 * ### Not a tool
 * No `static mcpScopes` — the default, and the default means not exposed. An agent reading a
 * transcript has the names; a picture is for the human looking at the screen.
 */
@injectable()
export class GetContactAvatarController extends Controller<
	typeof GetContactAvatarControllerInputSchema,
	typeof GetContactAvatarControllerOutputSchema
> {
	readonly path = '/ui/avatars/:channelId/:remoteId'
	readonly method = 'get' as const
	readonly description = 'The photo of one channel contact, cached daemon-side (the console renders it in chat bubbles and rosters)'
	readonly inputSchema = GetContactAvatarControllerInputSchema
	readonly outputSchema = GetContactAvatarControllerOutputSchema
	override contentType: MimeTypes = MimeTypes['.bin']
	override middlewares = [OperatorMiddleware]

	constructor(private readonly useCase: GetContactAvatar) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const avatar = await this.useCase.execute({
			ownerId: request.ctx.ownerId,
			channelId: request.params.channelId,
			remoteId: request.params.remoteId,
		})

		return this.rawResponse(
			new Response(avatar.bytes, {
				status: HttpStatusCode.OK,
				headers: {
					'Content-Type': avatar.contentType,
					'Content-Length': String(avatar.bytes.byteLength),
					// The bytes behind this url are content-addressed daemon-side (the cache key is the
					// photo's identity, not the contact's), so a hit is immutable for as long as the url
					// answers it. A day of browser cache is what keeps scrolling a long group thread from
					// re-asking for the same six faces.
					'Cache-Control': 'private, max-age=86400',
				},
			}),
		)
	}
}
