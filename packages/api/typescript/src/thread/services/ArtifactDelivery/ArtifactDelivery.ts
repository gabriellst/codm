import { CommandQueue } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { MessageAuthor } from '@codm/contracts-typescript/wire/enums'
import type { DeliverChannelMessage } from '../../usecases/DeliverChannelMessage'
import type { DeliverChannelAttachment } from '../../usecases/DeliverChannelAttachment'

/**
 * THE IGNITION for `artifact/usecases/SendArtifact` — the same cross-context SEAM shape as
 * `beginTypingPresence` (`thread/services/TypingPresence`), and for the identical reason.
 *
 * `SendArtifact` needs to enqueue `deliver_channel_message` (its `LINK` path) and
 * `deliver_channel_attachment` (every other kind) — both commands, both owned by THIS context. Reaching
 * them from `artifact` directly means importing `thread/usecases` (the class, for `enqueueCommand<T>`
 * and for the command's own `name`), and `usecases` is FORBIDDEN across a context boundary by
 * `CROSS_CONTEXT_POLICY` ("cross-context orchestration"). `services` IS on the allowed list, so the
 * ignition lands here — two free functions, no state, forwarding to the queue exactly the way
 * `beginTypingPresence` forwards to `sustain_typing_presence`.
 *
 * The two are bundled in one file because they share ONE caller (`SendArtifact`) and one job: turn a
 * validated `SendArtifact` decision (LINK vs. media) into the durable command row that actually
 * delivers it (B3, decision 2 — a command has ONE executor and is an instruction, not a fact).
 */

/**
 * `LINK` has no local bytes ("envio de artefatos pelo canal" design, decision 5): it goes out as TEXT
 * — `caption + "\n" + url`, composed by the caller — through the delivery command every other SYSTEM
 * message already rides (`RecordOrchestratorReply`, `RaiseStop`). `author` is always `SYSTEM` here:
 * this is the agent delivering an artifact, never the operator's own words.
 */
export async function enqueueArtifactLinkDelivery(
	commands: CommandQueue,
	input: Omit<DeliverChannelMessage['input'], 'author'>,
	tx?: Transaction,
): Promise<void> {
	await commands.enqueueCommand<DeliverChannelMessage>(
		'deliver_channel_message' satisfies DeliverChannelMessage['name'],
		{ ...input, author: MessageAuthor.SYSTEM },
		undefined,
		tx,
	)
}

/**
 * Every other `ArtifactKind` (IMAGE/VIDEO/AUDIO/FILE) — the media path. `DeliverChannelAttachment`
 * resolves the conversation (`channelId`/`contactExternalId`) itself from `input.threadId`; see its
 * own docblock for why the payload carries `threadId` rather than the resolved pair every OTHER
 * delivery command's enqueuer passes.
 */
export async function enqueueArtifactAttachmentDelivery(
	commands: CommandQueue,
	input: DeliverChannelAttachment['input'],
	tx?: Transaction,
): Promise<void> {
	await commands.enqueueCommand<DeliverChannelAttachment>(
		'deliver_channel_attachment' satisfies DeliverChannelAttachment['name'],
		input,
		undefined,
		tx,
	)
}
