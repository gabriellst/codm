import { injectable } from 'tsyringe-neo'
import { Handler, LoggingService, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { ArtifactKind, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { ChannelSender, type SendableArtifactKind } from '../services/ChannelSender'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'
import { ThreadRepository } from '../repositories/ThreadRepository'

/**
 * The `ArtifactKind`s this command ever carries — every one `ChannelSender.sendMedia` accepts, i.e.
 * every `SendableArtifactKind`. `LINK` never reaches here: `SendArtifact` routes it through
 * `deliver_channel_message` instead ("envio de artefatos pelo canal" design, decision 5).
 */
const DELIVERABLE_ARTIFACT_KINDS = [ArtifactKind.IMAGE, ArtifactKind.VIDEO, ArtifactKind.AUDIO, ArtifactKind.FILE] as const

export const DeliverChannelAttachmentInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	artifactId: z.uuid(),
	/** The STAGED copy — under the gateway's own media dir (`MediaStore.stage`), never the artifact's own `ref`. */
	mediaPath: z.string(),
	kind: z.enum(DELIVERABLE_ARTIFACT_KINDS),
	caption: z.string().optional(),
	/** FILE only — decision 6: basename of `ref`. */
	fileName: z.string().optional(),
	/** FILE only — decision 6: resolved by extension. */
	mimeType: z.string().optional(),
})

export const DeliverChannelAttachmentOutputSchema = z.void()

/**
 * The delivery leg for an artifact ("envio de artefatos pelo canal" design, decisions 2 and 4) — the
 * `deliver_channel_attachment` command `SendArtifact` enqueues, mirroring `DeliverChannelMessage`'s
 * shape for text (B3, decision 2: a durable command with ONE executor, not an event).
 *
 * ### Payload carries `threadId`, not `channelId`/`contactExternalId` — unlike `DeliverChannelMessage`
 * Every OTHER enqueuer of a delivery command (`SendDirectMessage`, `RecordOrchestratorReply`,
 * `RaiseStop`) already holds the `Thread` aggregate and passes its `channelId`/`contactRef.externalId`
 * straight through. `SendArtifact` does not need to load the aggregate at all for the media path — it
 * only validates the ARTIFACT (via `ArtifactRepository`) — so this handler is the one that resolves
 * the conversation, from `threadId` alone, the moment before it actually needs it.
 *
 * ### No entry exists yet when this handler starts — unlike the text path
 * A streamed or plain text reply is recorded by its PRODUCER (`RecordOrchestratorReply`,
 * `StreamChannelReply`) before delivery is ever enqueued, so `DeliverChannelMessage` only ever LINKS an
 * entry that already exists. An artifact send has no earlier moment that "this went out" becomes true —
 * `SendArtifact` only validates and stages bytes, it does not narrate. So this handler both sends AND
 * records the `SYSTEM` entry, in that order: the entry text (decision 4) is `caption ?? ''`, and it
 * carries `mediaPath` (the STAGED copy) and `artifactId` — the two columns "envio de artefatos pelo
 * canal" adds to `TranscriptEntry` for exactly this purpose (console renders it as the artifact bubble
 * on the agent's side, same shape `mediaPath` already established for inbound media).
 *
 * ### The claim, and why it happens BEFORE the entry write, in the SAME transaction
 * WhatsApp echoes back everything this account sends (the same `fromMe` loop `DeliverChannelMessage`'s
 * docblock names). Claiming the echo's `messageId` in `ConsumedMessageRepository` is what keeps
 * `ConsumeInboundMessage` from turning this delivery's own echo into a spurious CONTACT entry — AC-3 of
 * the design, the same regression class as the "Pensando" placeholder bug. `claim` and the entry write
 * ride ONE transaction so a crash between them cannot leave an unclaimed echo (repeat of that bug) or
 * an unrecorded delivery (a message the console never shows).
 */
@injectable()
export class DeliverChannelAttachment extends Handler<typeof DeliverChannelAttachmentInputSchema, typeof DeliverChannelAttachmentOutputSchema> {
	readonly name = 'deliver_channel_attachment' as const
	readonly inputSchema = DeliverChannelAttachmentInputSchema
	readonly outputSchema = DeliverChannelAttachmentOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly sender: ChannelSender,
		private readonly consumed: ConsumedMessageRepository,
		private readonly logging: LoggingService,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const { ownerId, threadId, artifactId, mediaPath, kind, caption, fileName, mimeType } = input

		// Defensive drop, same posture as `RecordOrchestratorReply`: a delivery for a thread that no
		// longer resolves has nowhere to go, and a THROW here would only earn a retry against an id that
		// will never resolve either.
		const thread = await this.threads.findById(threadId)
		if (!thread || thread.ownerId !== ownerId) return

		// EXTERNAL I/O OUTSIDE ANY TRANSACTION — the sanctioned shape `DeliverChannelMessage` already
		// takes (cc-bp-24's named exception): a failure here backs the `deliver_channel_attachment`
		// command off and the `CommandQueue` retries it; the claim/entry below never run on a failed send.
		const { messageId } = await this.sender.sendMedia(
			{
				channelId: thread.channelId,
				remoteId: thread.contactRef.externalId,
				kind: kind as SendableArtifactKind,
				mediaPath,
				caption,
				fileName,
				mimeType,
			},
			ownerId,
		)

		await this.withTransaction(tx, async tx => {
			await this.consumed.claim({ ownerId, channelId: thread.channelId, platformMessageId: messageId }, tx)
			const entry = thread.recordEntry({ kind: TranscriptKind.SYSTEM, text: caption ?? '', mediaPath, artifactId, at: new Date() })
			await this.threads.save(thread, tx)
			await this.consumed.linkEntry({ channelId: thread.channelId, platformMessageId: messageId, threadId: thread.id.value, entryId: entry.entryId }, tx)
		})

		this.logging.info({ content: { message: 'channel attachment delivered', channelId: thread.channelId, messageId, artifactId, kind } })
	}
}
