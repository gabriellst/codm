import { injectable } from 'tsyringe-neo'
import { DatabaseDriver, DomainEventRepository } from '@codm/core-typescript'
import { usageFactsOf } from '../../utils/usageFacts'
import { SmallModelUsageRecorder, type SmallModelSpend } from './SmallModelUsageRecorder'

/**
 * Records a small-model run's spend as facts — `agent.turn.usage` with the run's `role` (`TRIAGE` or `SUPERVISOR`),
 * plus `limit_observed` when the provider refused or warned — in ONE transaction of its own. The same in every
 * environment (the env split lives in the driver under it).
 *
 * Writes through the repositories directly rather than calling a use case: a use case reached from a SERVICE is
 * not bound to the container unless a pipeline boundary binds it (`HANDLER_NOT_BOUND` — the precedent and its
 * reasoning are in `owner/services/PgOwnerDirectory`), and the triage and the supervisor are services any caller may
 * resolve directly. The facts are built by the same `usageFactsOf` the issue and orchestrator turns use, so every role
 * is stamped one way.
 */
@injectable()
export class FactSmallModelUsageRecorder extends SmallModelUsageRecorder {
	constructor(
		private readonly driver: DatabaseDriver,
		private readonly events: DomainEventRepository,
	) {
		super()
	}

	async record({ ownerId, entityId, role, provider, model, result }: SmallModelSpend): Promise<void> {
		const facts = usageFactsOf({
			entityId,
			ownerId,
			role,
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
