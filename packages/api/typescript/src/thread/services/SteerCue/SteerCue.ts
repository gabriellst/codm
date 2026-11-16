import type Z from 'zod'
import { type CommandQueue, type LoggingService, tryCatchAsync, z } from '@codm/core-typescript'
import { SteerProgress } from '../../enums'
import { CUE_DELIVERED, CUE_READ } from '../../utils/ChannelCues'
import { ReactToChannelMessageInputSchema, type ReactToChannelMessage } from '../../usecases/ReactToChannelMessage'

/**
 * WHERE A ROUTED STEER CAME FROM — the reaction address of the channel message the rule layer turned
 * into a STEER (fase 2, item 5), plus its transcript entry.
 *
 * It travels ON the mailbox item, because the transcript keeps no platform message id: the ingest is
 * the one moment the wamid, the author and the chat are all in hand. COMPOSED from the reaction
 * command's own input (minus the emoji, which is the stage's to choose), never redeclared.
 *
 * Present ⟺ the steer came from a channel message AND the ingest would have reacted to it (a platform
 * id, reactions on for the thread). Console steers, loop ticks, stop resolutions and the declaration
 * reminder never carry one, so they stay silent by declaration rather than by a branch.
 */
export const RoutedSteerOriginSchema = ReactToChannelMessageInputSchema.omit({ reaction: true }).extend({
	/** The transcript entry of the routed message — what the cue's job id is derived from. */
	entryId: z.uuid(),
})
export type RoutedSteerOrigin = Z.infer<typeof RoutedSteerOriginSchema>

/** The cue each stage hangs on the message — dispatched by the stage, never branched on it. */
const STEER_PROGRESS_CUE: Readonly<Record<SteerProgress, string>> = {
	[SteerProgress.DELIVERED]: CUE_DELIVERED,
	[SteerProgress.READ]: CUE_READ,
}

interface CueRoutedSteer {
	commands: CommandQueue
	logging: LoggingService
	origin: RoutedSteerOrigin
	stage: SteerProgress
}

/**
 * "ENTREGUE / LIDO" ON THE MESSAGE ITSELF (fase 2, item 5) — schedule the reaction that says how far a
 * routed steer got: `☑️` when the session first receives it, `✅` when the turn that read it ends.
 *
 * A cross-context SEAM on the services surface, the shape `beginTypingPresence` already has: the caller
 * is the agent's mailbox dispatcher (it is the one that knows when an item is claimed and consumed),
 * while the command's name, payload and emojis belong here. A function, not an injectable: it owns no
 * state, the durable queue row is the whole effect.
 *
 * The job id is the ENTRY plus the STAGE: distinct from the ingest's `cue:<entry>` (the `👀`), so a 👀
 * still queued is not swallowed by a conflict, and one per stage, so a redelivered stage reacts once.
 * The command queue runs due rows in `run_at` order, so the 👀 queued at ingest leaves before the ☑️.
 *
 * BEST-EFFORT like every cue (streaming spec, decision 12): a queue that refuses costs the emoji and
 * nothing else — the caller is mid-turn bookkeeping and must never fail on a decoration.
 */
export async function cueRoutedSteer({ commands, logging, origin, stage }: CueRoutedSteer): Promise<void> {
	const { entryId, ...address } = origin
	const outcome = await tryCatchAsync(() =>
		commands.enqueueCommand<ReactToChannelMessage>(
			'react_to_channel_message' satisfies ReactToChannelMessage['name'],
			{ ...address, reaction: STEER_PROGRESS_CUE[stage] },
			{ jobId: `cue:${entryId}:${stage}` },
		),
	)
	if (!outcome.success) {
		logging.info({ content: { message: 'steer cue not scheduled (best-effort)', entryId, stage, reason: outcome.error.message } })
	}
}
