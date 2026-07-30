import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@codedm/core-typescript'
import { OrchestratorRepliedEvent } from '@codedm/contracts-typescript/wire/events'
import { RecordOrchestratorReply } from '../usecases/RecordOrchestratorReply'

/**
 * The agent context speaks in issues, the channel in conversations — only the thread knows which
 * contact an issue belongs to, so the reply→delivery translation lives here.
 *
 * THIN BY DESIGN (B3, decision 2). A handler runs outside any transaction, so it cannot own a
 * transactional body: it validates the envelope and delegates to `RecordOrchestratorReply`, which
 * opens its own UnitOfWork and writes the transcript entry + enqueues the delivery command together.
 * This handler publishes NOTHING — integration publication in this context belongs to
 * `PublishThreadIntegrationEvents` alone (decision 4).
 */
@injectable()
export class DeliverOrchestratorReply extends EventHandler<typeof OrchestratorRepliedEvent> {
	readonly event = OrchestratorRepliedEvent

	constructor(private readonly record: RecordOrchestratorReply) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.ownerId
		// An envelope without an owner is undeliverable — the gateway scopes every write by owner and
		// must never be handed a forged one.
		if (!ownerId) return

		await this.record.execute({
			ownerId,
			threadId: event.payload.threadId,
			text: event.payload.text,
			replyToEntryId: event.payload.replyToEntryId,
		})
	}
}
