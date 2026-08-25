import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { ArtifactKind } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { ChannelSender, MockChannelSender } from '../services/ChannelSender'

export const TestReadChannelSenderInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		query: z.object({ channelId: z.uuid(), remoteId: z.string().min(1) }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			query: { channelId: '00000000-0000-4000-8000-000000000002', remoteId: 'e2e-contact' },
		},
	])

export const TestReadChannelSenderOutputSchema = z.object({
	/** Every `send()` this conversation received, in order, with the `mock-wamid-N` id it was minted. */
	sent: z.array(z.object({ messageId: z.string(), text: z.string() })),
	/** Every `edit()` this conversation received, in order. */
	edits: z.array(z.object({ messageId: z.string(), text: z.string() })),
	/** How many `signalTyping()` beats this conversation received. */
	typingBeatCount: z.number(),
	/**
	 * Every `sendMedia()` this conversation received, in order — the e2e counterpart of
	 * `MockChannelSender.sentMedia` ("envio de artefatos pelo canal" design, AC-7). `mediaPath` is
	 * exposed here (unlike `GetSessionChat`'s wire DTO) because THIS door is test-only plumbing, not a
	 * console read: the spec needs to see the STAGED path landed under the media dir, which is exactly
	 * what a real gateway would have checked (`MEDIA_PATH_NOT_ALLOWED`) had this env not mocked it.
	 */
	sentMedia: z.array(
		z.object({
			messageId: z.string(),
			kind: z.enum(ArtifactKind),
			mediaPath: z.string(),
			caption: z.string().optional(),
			fileName: z.string().optional(),
		}),
	),
})

/**
 * TEST-ONLY read of the in-process `ChannelSender` double (thinking-indicator spec, T5) — the e2e
 * counterpart of `shared/controllers/TestIngressController`'s WRITE seam, this one a READ.
 *
 * ### WHY THIS HAS TO EXIST AT ALL
 * `thread/registry.ts` binds `ChannelSender` to `MockChannelSender` under BOTH `integration` and
 * `e2e` (the `e2e` column is OMITTED, so `expandBindings` mirrors `integration` — see that file's own
 * comment: "the Playwright harness boots the REAL daemon but there is no Go gateway behind it"). So
 * every `send`/`edit`/`signalTyping` call `RunOrchestratorTurn` makes for the "Pensando" placeholder
 * stays IN-PROCESS, in the daemon's own memory — it never reaches the Go gateway's `overlay.go`
 * scenario, and a Playwright spec (a SEPARATE process talking only HTTP) has no way to observe it
 * without a seam. This is that seam: a READ door onto the SAME singleton `MockChannelSender` instance
 * (`registerAll` binds a plain class as a container SINGLETON — see `Registry.ts`) that
 * `RunOrchestratorTurn` writes through.
 *
 * ### WHY IT LIVES IN `thread/`, NOT BESIDE THE GATEWAY SIMULATOR IN `shared/`
 * Same precedent as `agent/controllers/TestRunIssueTurn.ts`: the seam it drives (`ChannelSender`) is a
 * `thread` service, and a door in `shared/` would make the root context import a leaf's own service —
 * the cross-context edge `bun detect`'s import-direction rail (context-map) exists to keep shut. Living
 * here means ZERO new cross-context edges: `ChannelSender` is already `thread`'s own `services` surface.
 *
 * ### WHY `messageId` IS READ OFF THE RECORD, NOT RECOMPUTED FROM THE ARRAY'S INDEX
 * `MockChannelSender.send()`/`sendMedia()` share ONE `seq` counter ("envio de artefatos pelo canal"
 * design) — a conversation that mixes text and media sends would make `mock-wamid-${index + 1}`
 * (recomputed per-array) diverge from the TRUE id the moment a `sendMedia()` call lands between two
 * `send()`s. `MockChannelSender` now stamps `messageId` onto each record at mint time instead, so this
 * door (and `screen()`) just reads it back — correct regardless of how the two calls interleave.
 *
 * Mounted ONLY under the `e2e` boot environment (`thread/controllers/index.ts`, `byEnvironment`),
 * refused under NODE_ENV=production by `setBoundedContextEnvironment`, and never emitted to the
 * SDK/OpenAPI (emission never selects `e2e`) — same discipline as `TestIngressController` and
 * `TestRunIssueTurnController`.
 */
@injectable()
export class TestReadChannelSenderController extends Controller<
	typeof TestReadChannelSenderInputSchema,
	typeof TestReadChannelSenderOutputSchema
> {
	readonly path = '/_test/channel-sender'
	readonly method = 'get' as const
	readonly description = 'TEST-ONLY: read the in-process MockChannelSender double, scoped to one conversation'
	readonly inputSchema = TestReadChannelSenderInputSchema
	readonly outputSchema = TestReadChannelSenderOutputSchema

	override middlewares = [CloudSessionMiddleware]

	constructor(private readonly sender: ChannelSender) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		// `ChannelSender` is ABSTRACT and bound per-env (`thread/registry.ts`); this door only makes
		// sense over the double. A `real` boot never mounts this controller at all (byEnvironment,
		// index.ts), so the branch below is unreachable there — it exists for the type, not for a case
		// this door is ever asked to serve.
		if (!(this.sender instanceof MockChannelSender)) {
			return { status: HttpStatusCode.OK, data: { sent: [], edits: [], typingBeatCount: 0, sentMedia: [] } }
		}

		const { channelId, remoteId } = request.query
		const isThisConversation = (candidate: { channelId: string; remoteId: string }): boolean =>
			candidate.channelId === channelId && candidate.remoteId === remoteId

		const sent = this.sender.sent.filter(isThisConversation).map(({ messageId, text }) => ({ messageId, text }))
		const edits = this.sender.edits.filter(isThisConversation).map(({ messageId, text }) => ({ messageId, text }))
		const typingBeatCount = this.sender.typingBeats.filter(isThisConversation).length
		const sentMedia = this.sender.sentMedia
			.filter(isThisConversation)
			.map(({ messageId, kind, mediaPath, caption, fileName }) => ({ messageId, kind, mediaPath, caption, fileName }))

		return { status: HttpStatusCode.OK, data: { sent, edits, typingBeatCount, sentMedia } }
	}
}
