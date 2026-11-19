import { injectable } from 'tsyringe-neo'
import { stat } from 'node:fs/promises'
import { BaseError } from '@codm/core-typescript'
import { ArtifactKind } from '@codm/contracts-typescript/wire/enums'
import { ChannelSender, type SendableArtifactKind } from '@thread/services/ChannelSender'
import type { ApplicationErrors } from '../../errors'

/**
 * Per-kind ceiling ("envio de artefatos pelo canal" design, decision 6) — IMAGE/VIDEO/AUDIO share
 * WhatsApp's own inline media ceiling; FILE gets the larger document ceiling, the SAME 64 MiB the
 * gateway's own inbound path already caps at (`maxInboundMediaBytes`, `whatsmeow_channel.go`).
 */
export const SIZE_LIMIT_BYTES: Record<SendableArtifactKind, number> = {
	[ArtifactKind.IMAGE]: 16 << 20,
	[ArtifactKind.VIDEO]: 16 << 20,
	[ArtifactKind.AUDIO]: 16 << 20,
	[ArtifactKind.FILE]: 64 << 20,
}

/** What can go to the channel, as the check found it — a link (text) or local bytes of a media kind. */
export type Sendable = { kind: ArtifactKind.LINK; url: string } | { kind: SendableArtifactKind; ref: string; sizeBytes: number }

/**
 * WHETHER AN ARTIFACT CAN REACH THE CHANNEL — the refusals `SendArtifact` makes before it enqueues
 * anything ("envio de artefatos pelo canal" design, decision 6), written once so every door that hands
 * an artifact to the group refuses the same way and SYNCHRONOUSLY: `SendArtifact` (the orchestrator's and
 * the operator's tool) and the issue's `RequestFeedback` (fase 3, item 1), whose preview the output policy
 * delivers later — a refusal discovered by a failed delivery command would be retried and dead-lettered
 * instead of answered to the session that can fix it.
 *
 * A `LINK` has no bytes: it goes out as text, so the media capability and the ceilings do not apply.
 */
@injectable()
export class ArtifactSendability {
	constructor(private readonly sender: ChannelSender) {}

	async check(artifact: { id: string; kind: ArtifactKind; ref: string }): Promise<Sendable> {
		if (artifact.kind === ArtifactKind.LINK) return { kind: ArtifactKind.LINK, url: artifact.ref }

		if (!this.sender.capabilities.media)
			throw new BaseError<ApplicationErrors>('CHANNEL_MEDIA_UNSUPPORTED', 'this channel cannot deliver media messages')

		const stats = await stat(artifact.ref).catch(() => undefined)
		if (!stats?.isFile())
			throw new BaseError<ApplicationErrors>('ARTIFACT_FILE_MISSING', `artifact ${artifact.id} no longer has a file at its ref`)

		const kind = artifact.kind as SendableArtifactKind
		if (stats.size > SIZE_LIMIT_BYTES[kind])
			throw new BaseError<ApplicationErrors>(
				'ARTIFACT_TOO_LARGE',
				`artifact ${artifact.id} is ${stats.size} bytes, over the ${kind} ceiling`,
			)

		return { kind, ref: artifact.ref, sizeBytes: stats.size }
	}
}
