import { injectable } from 'tsyringe-neo'
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { CommandQueue, Handler, LoggingService, MimeTypeExtractor, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { ArtifactKind, MessageAuthor } from '@codm/contracts-typescript/wire/enums'
import { MediaStore } from '@shared/services/MediaStore'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ChannelSender, type SendableArtifactKind } from '../services/ChannelSender'
import { IssueArtifactReader } from '../services/IssueArtifactReader'
import { enqueueArtifactAttachmentDelivery } from '../services/ArtifactDelivery'
import type { DeliverChannelMessage } from './DeliverChannelMessage'

export const DeliverIssuePreviewInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	/** The FEEDBACK entry the output policy recorded — its text is the caption, its `artifactId` the preview. */
	entryId: z.uuid(),
})
export const DeliverIssuePreviewOutputSchema = z.void()

/**
 * Send an issue's FEEDBACK to the group WITH ITS PREVIEW (fase 3, item 2) — the `deliver_issue_preview`
 * command the output policy queues when a feedback goes out on its own. The main print goes as media with the
 * message as its caption ("APP-12 · prévia — … (+2 no console)" + the issue's link); the other artifacts stay
 * on the console until the panel has a gallery (spec, pré-requisito — question to the owner).
 *
 * The file was checked when the issue asked (`RequestFeedback`, synchronous). If it is gone by now, or the
 * channel takes no media, the feedback still goes out — as text — instead of dying in a retried command:
 * the words are the part the group cannot do without. A `LINK` preview has no bytes: its URL goes in the text.
 *
 * The entry already exists (the policy recorded it), so the delivery LINKS it (`replyEntryId`) and never
 * records a second one.
 */
@injectable()
export class DeliverIssuePreview extends Handler<typeof DeliverIssuePreviewInputSchema, typeof DeliverIssuePreviewOutputSchema> {
	readonly name = 'deliver_issue_preview' as const
	readonly inputSchema = DeliverIssuePreviewInputSchema
	readonly outputSchema = DeliverIssuePreviewOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly artifacts: IssueArtifactReader,
		private readonly sender: ChannelSender,
		private readonly mediaStore: MediaStore,
		private readonly commands: CommandQueue,
		private readonly logging: LoggingService,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const thread = await this.threads.findById(input.threadId)
		const entry = await this.threads.findEntry(input.entryId)
		// Defensive drop, like every delivery: nothing to send for a conversation or an entry that is gone.
		if (!thread || thread.ownerId !== input.ownerId || !entry || entry.threadId !== thread.id.value) return

		const artifact = entry.artifactId ? await this.artifacts.find(entry.artifactId) : undefined
		if (artifact && artifact.kind !== ArtifactKind.LINK && this.sender.capabilities.media) {
			const present = await stat(artifact.ref).then(
				stats => stats.isFile(),
				() => false,
			)
			const staged = present ? await this.mediaStore.stage(artifact.ref).catch(() => undefined) : undefined
			if (staged) {
				const kind = artifact.kind as SendableArtifactKind
				await enqueueArtifactAttachmentDelivery(
					this.commands,
					{
						ownerId: input.ownerId,
						threadId: thread.id.value,
						artifactId: artifact.artifactId,
						mediaPath: staged.mediaPath,
						kind,
						caption: entry.text,
						issueId: entry.issueId,
						replyEntryId: entry.entryId,
						...(kind === ArtifactKind.FILE
							? { fileName: basename(artifact.ref), mimeType: MimeTypeExtractor.extractMimeType(artifact.ref) }
							: {}),
					},
					tx,
				)
				return
			}
		}

		if (artifact?.kind !== ArtifactKind.LINK) {
			this.logging.warn({
				content: {
					message: 'feedback preview not sendable any more — the feedback goes out as text',
					entryId: entry.entryId,
					artifactId: entry.artifactId,
				},
			})
		}
		const text = artifact?.kind === ArtifactKind.LINK ? `${entry.text}\n${artifact.ref}` : entry.text
		await this.commands.enqueueCommand<DeliverChannelMessage>(
			'deliver_channel_message',
			{
				ownerId: input.ownerId,
				channelId: thread.channelId,
				contactExternalId: thread.contactRef.externalId,
				text,
				author: MessageAuthor.SYSTEM,
				replyEntryId: entry.entryId,
				replyThreadId: thread.id.value,
				reactionsEnabled: thread.reactionsEnabled,
			},
			{ jobId: entry.entryId },
			tx,
		)
	}
}
