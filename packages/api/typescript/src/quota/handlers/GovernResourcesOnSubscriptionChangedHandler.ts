import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@template/core-typescript'
import { SubscriptionChangedEvent } from '@template/contracts-typescript/wire/events'
import { ResourceLimitEnforcer } from '@quota/services'

// Drives `ResourceLimitEnforcer` off the thin cross-context `SubscriptionChangedEvent` (billing emits
// it on every access-affecting subscription change). The event carries only `ownerId` (on the
// envelope); the enforcer re-queries the owner's current entitlement itself
// (`QuotaEntitlement.entitlementFor`), so this handler stays a one-line trigger — a stale or reordered
// delivery can never apply stale facts. This is what makes a plan downgrade actually apply the
// over-quota locks (medscall@f04e8a0f port).
@injectable()
export class GovernResourcesOnSubscriptionChangedHandler extends EventHandler<typeof SubscriptionChangedEvent> {
	readonly event = SubscriptionChangedEvent

	constructor(private enforcer: ResourceLimitEnforcer) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		await this.enforcer.enforce(event.ownerId)
	}
}
