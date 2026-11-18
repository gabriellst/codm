import { injectable } from 'tsyringe-neo'
import { BaseError, CommandQueue, Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { OutputRouting, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { CloudSession } from '@shared/services/CloudSession'
import { resolveThreadLanguage } from '@shared/i18n/messages'
import { PanelPublisher } from '@issue/services/PanelPublisher'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { THREAD_MESSAGES } from '../i18n/messages'
import { enqueueSignalDelivery } from '../utils/issueSignal'
import type { TranscriptEntry } from '../entities/Thread'

export const FlushSignalDigestInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	/** The person whose window closed — absent for the signals that have no person (they digest together). */
	addresseeId: z.string().min(1).optional(),
})
export const FlushSignalDigestOutputSchema = z.object({
	/** How many waiting signals this flush sent — 0 when another flush already did. */
	flushed: z.number().int().nonnegative(),
})

/**
 * A person's window closed (fase 3, item 2): the questions and feedback that waited for them leave TOGETHER —
 * the `flush_signal_digest` command the output policy queued when the first of them was recorded
 * (`DIGEST_WINDOW_MS` later, one job per person per window).
 *
 * - none waiting (another flush got them) → nothing;
 * - ONE → it goes out as itself, in its own format (a feedback with its preview); its routing becomes
 *   `GROUP`, the routing that actually happened;
 * - TWO OR MORE → one digest message ("Ana, 3 coisas: …" + the group's panel link, no attachment: the
 *   previews stay behind the link); each signal points at it (`digestEntryId`) — the pointer a quoted
 *   reply follows to its questions, and the one that starts their 15 minutes when the digest is delivered.
 *
 * Decisions never wait here: the policy sends them on their own (they need a quote of their own).
 * Two flushes of the same signals cannot both send: the patch is conditional on the signal still waiting
 * (`SIGNAL_ALREADY_FLUSHED` rolls the loser back, and it sends nothing).
 */
@injectable()
export class FlushSignalDigest extends Handler<typeof FlushSignalDigestInputSchema, typeof FlushSignalDigestOutputSchema> {
	readonly name = 'flush_signal_digest' as const
	readonly inputSchema = FlushSignalDigestInputSchema
	readonly outputSchema = FlushSignalDigestOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly session: CloudSession,
		private readonly panel: PanelPublisher,
		private readonly commands: CommandQueue,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const thread = await this.threads.findById(input.threadId, tx)
		if (!thread || thread.ownerId !== input.ownerId) return { flushed: 0 }
		const ownerLanguage = thread.language ? undefined : (await this.session.identity())?.user.language
		const language = resolveThreadLanguage(thread.language, ownerLanguage)
		const panelLink = this.panel.linkOf(thread.id.value)

		try {
			return await this.withTransaction(tx, async tx => {
				const waiting = await this.threads.pendingDigest(thread.id.value, input.addresseeId, tx)
				const [only] = waiting
				if (!only) return { flushed: 0 }

				if (waiting.length === 1) {
					thread.releaseFromDigest(only)
					await this.threads.save(thread, tx)
					await enqueueSignalDelivery(this.commands, thread, only, OutputRouting.GROUP, tx)
					return { flushed: 1 }
				}

				const digest = thread.recordEntry({
					kind: TranscriptKind.SYSTEM,
					text: THREAD_MESSAGES.signalDigest(language, {
						name: input.addresseeId ? thread.rosterNameOf(input.addresseeId) : undefined,
						items: waiting.map(entry => withoutLinks(entry, panelLink)),
						link: panelLink,
					}),
					routing: OutputRouting.GROUP,
					addresseeId: input.addresseeId,
				})
				thread.foldIntoDigest(waiting, digest)
				await this.threads.save(thread, tx)
				await enqueueSignalDelivery(this.commands, thread, digest, OutputRouting.GROUP, tx)
				return { flushed: waiting.length }
			})
		} catch (error) {
			// Another flush sent these first — the transaction rolled back, nothing of this one went out.
			if (error instanceof BaseError && error.name === 'SIGNAL_ALREADY_FLUSHED') return { flushed: 0 }
			throw error
		}
	}
}

/** A signal's text as a digest item — without its issue link: the digest ends with the group's link once. */
function withoutLinks(entry: TranscriptEntry, panelLink: string | undefined): string {
	if (!panelLink) return entry.text
	return entry.text
		.split('\n')
		.filter(line => !line.startsWith(panelLink))
		.join('\n')
}
