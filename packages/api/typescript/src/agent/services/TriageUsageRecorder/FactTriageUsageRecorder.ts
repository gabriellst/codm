import { injectable } from 'tsyringe-neo'
import { DatabaseDriver, DomainEventRepository } from '@codm/core-typescript'
import { UsageRole } from '@codm/contracts-typescript/wire/enums'
import { usageFactsOf } from '../../utils/usageFacts'
import { TriageUsageRecorder, type TriageSpend } from './TriageUsageRecorder'

/**
 * Records the triage's spend as facts — `agent.turn.usage` with `role: TRIAGE`, plus `limit_observed` when the provider
 * refused or warned — in ONE transaction of its own. The same in every environment (the env split lives in the
 * driver under it).
 *
 * Writes through the repositories directly rather than calling a use case: a use case reached from a SERVICE is
 * not bound to the container unless a pipeline boundary binds it (`HANDLER_NOT_BOUND` — the precedent and its
 * reasoning are in `owner/services/PgOwnerDirectory`), and the triage is a service any caller may resolve directly.
 * The facts are built by the same `usageFactsOf` the issue and orchestrator turns use, so the three roles are
 * stamped one way.
 */
@injectable()
export class FactTriageUsageRecorder extends TriageUsageRecorder {
	constructor(
		private readonly driver: DatabaseDriver,
		private readonly events: DomainEventRepository,
	) {
		super()
	}

	async record({ ownerId, threadId, provider, model, result }: TriageSpend): Promise<void> {
		const facts = usageFactsOf({
			entityId: threadId,
			ownerId,
			role: UsageRole.TRIAGE,
			provider,
			model,
			usage: result.usage,
			providerLimits: result.providerLimits ?? [],
			limitWindows: result.limitWindows ?? [],
		})
		if (facts.length === 0) return
		await this.driver.unitOfWorkFactory.create().transaction(async tx => {
			for (const fact of facts) await this.events.save(fact, tx)
		})
	}
}
