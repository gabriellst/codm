import { injectable } from 'tsyringe-neo'
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { Handler, z, BaseError, CommandQueue, MimeTypeExtractor } from '@codm/core-typescript'
import { ArtifactKind } from '@codm/contracts-typescript/wire/enums'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { ChannelSender, type SendableArtifactKind } from '@thread/services/ChannelSender'
import { enqueueArtifactLinkDelivery, enqueueArtifactAttachmentDelivery } from '@thread/services/ArtifactDelivery'
import { ArtifactRepository } from '../repositories/ArtifactRepository'
import { MediaStore } from '../services/MediaStore'
import type { ApplicationErrors } from '../errors'

export const SendArtifactInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	artifactId: z.uuid(),
	caption: z.string().optional(),
})

export const SendArtifactOutputSchema = z.void()

/**
 * Per-kind ceiling ("envio de artefatos pelo canal" design, decision 6) — IMAGE/VIDEO/AUDIO share
 * WhatsApp's own inline media ceiling; FILE gets the larger document ceiling, the SAME 64 MiB the
 * gateway's own inbound path already caps at (`maxInboundMediaBytes`, `whatsmeow_channel.go`).
 */
const SIZE_LIMIT_BYTES: Record<Exclude<ArtifactKind, ArtifactKind.LINK>, number> = {
	[ArtifactKind.IMAGE]: 16 << 20,
	[ArtifactKind.VIDEO]: 16 << 20,
	[ArtifactKind.AUDIO]: 16 << 20,
	[ArtifactKind.FILE]: 64 << 20,
}

/**
 * The tool an agent's run calls to hand an already-recorded artifact to the contact on the channel
 * ("envio de artefatos pelo canal" design, decisions 1 and 2) — `mcp__codm__SendArtifact`, always
 * preceded by `RecordArtifact` in the same run (decision 7's prompt instruction).
 *
 * ### Registrar ≠ entregar (decision 2)
 * `RecordArtifact` catalogs a file; this delivers it. Splitting them is what lets delivery FAIL and
 * RETRY independently of the catalog entry (the command row is durable, `RecordArtifact`'s write is
 * already committed by the time this runs), and is what a future console "send to contact" button
 * reuses without touching the recording path at all.
 *
 * ### Every check below runs BEFORE anything is enqueued (decision 6)
 * `ARTIFACT_NOT_FOUND`, `ARTIFACT_FILE_MISSING`, `ARTIFACT_TOO_LARGE`, `CHANNEL_MEDIA_UNSUPPORTED` are
 * all use-case-time refusals. None of them can surface as a failed `deliver_channel_attachment`
 * command — a command that fails is RETRIED (3 attempts, dead-lettered), and retrying a request that
 * can never succeed (the file will not reappear, the ceiling will not change) only delays the same
 * answer the caller could have had immediately.
 *
 * ### `LINK` never touches `MediaStore` or `ChannelSender.sendMedia` (decision 5)
 * A `LINK` artifact's `ref` is a URL, not a local file — there are no bytes to stage or send as media.
 * It goes out as TEXT (`caption` + the url, or just the url) through the ordinary
 * `deliver_channel_message` command every other SYSTEM line already rides. This is also why the
 * `capabilities.media` / size-ceiling checks below are skipped entirely for `LINK`: they ask questions
 * a text send has no use for.
 */
@injectable()
export class SendArtifact extends Handler<typeof SendArtifactInputSchema, typeof SendArtifactOutputSchema> {
	readonly name = 'send_artifact' as const
	readonly inputSchema = SendArtifactInputSchema
	readonly outputSchema = SendArtifactOutputSchema

	constructor(
		private readonly artifacts: ArtifactRepository,
		private readonly threads: ThreadRepository,
		private readonly sender: ChannelSender,
		private readonly mediaStore: MediaStore,
		private readonly commands: CommandQueue,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<void> {
		const { ownerId, threadId, artifactId, caption } = input

		const artifact = await this.artifacts.findById(artifactId)
		if (!artifact || artifact.ownerId !== ownerId || artifact.threadId !== threadId)
			throw new BaseError<ApplicationErrors>('ARTIFACT_NOT_FOUND', `no artifact ${artifactId} on thread ${threadId}`)

		const thread = await this.threads.findById(threadId)
		if (!thread || thread.ownerId !== ownerId) throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${threadId}`)

		if (artifact.kind === ArtifactKind.LINK) {
			const text = caption ? `${caption}\n${artifact.ref}` : artifact.ref
			await enqueueArtifactLinkDelivery(this.commands, {
				ownerId,
				channelId: thread.channelId,
				contactExternalId: thread.contactRef.externalId,
				text,
				// This LINK delivery rides the SAME `recordOutbound` cue gate as an orchestrator reply
				// (reactions/streaming spec) — passed through for the identical reason
				// `RecordOrchestratorReply` does: the aggregate is already in hand here.
				reactionsEnabled: thread.reactionsEnabled,
			})
			return
		}

		if (!this.sender.capabilities.media)
			throw new BaseError<ApplicationErrors>('CHANNEL_MEDIA_UNSUPPORTED', 'this channel cannot deliver media messages')

		const stats = await stat(artifact.ref).catch(() => undefined)
		if (!stats?.isFile())
			throw new BaseError<ApplicationErrors>('ARTIFACT_FILE_MISSING', `artifact ${artifactId} no longer has a file at its ref`)

		const kind = artifact.kind as SendableArtifactKind
		if (stats.size > SIZE_LIMIT_BYTES[kind])
			throw new BaseError<ApplicationErrors>(
				'ARTIFACT_TOO_LARGE',
				`artifact ${artifactId} is ${stats.size} bytes, over the ${kind} ceiling`,
			)

		const staged = await this.mediaStore.stage(artifact.ref)

		await enqueueArtifactAttachmentDelivery(this.commands, {
			ownerId,
			threadId,
			artifactId,
			mediaPath: staged.mediaPath,
			kind,
			caption,
			...(kind === ArtifactKind.FILE
				? { fileName: basename(artifact.ref), mimeType: MimeTypeExtractor.extractMimeType(artifact.ref) }
				: {}),
		})
	}
}
