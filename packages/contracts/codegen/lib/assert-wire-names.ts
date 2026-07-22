import type { ParsedEvent } from './parse-openapi'

/**
 * The outbox routing prefix. The TS OutboxDispatcher routes every persisted event by exactly this
 * predicate — `event.name.startsWith('integration.')` → ExternalMediator (cross-service), anything
 * else → InternalMediator (in-process); see
 * packages/api/typescript/core/src/services/OutboxDispatcher/DrizzleOutboxDispatcher.ts
 * (routing introduced in 6b9c7578e).
 */
export const INTEGRATION_EVENT_PREFIX = 'integration.'

/**
 * Hard gate on wire event names — called by BOTH emitters (emit-wire-ts / emit-wire-go), and by
 * each emitter's `run()` right after parsing, BEFORE any generated file is removed or rewritten,
 * so a non-conforming contract can never wipe or partially regenerate the committed bindings.
 *
 * A contracts event emitted without the prefix would be dispatched in-process as if it were a
 * context-private domain event and silently never reach the other backend — the exact dead-route
 * bug 6b9c7578e fixed for billing→quota.
 */
export function assertIntegrationWireNames(events: ParsedEvent[]): void {
	for (const ev of events) {
		if (!ev.wireName.startsWith(INTEGRATION_EVENT_PREFIX)) {
			throw new Error(
				`Wire event ${ev.modelName} has name "${ev.wireName}" — every integration event wire name must start with "${INTEGRATION_EVENT_PREFIX}". ` +
					`The outbox routes internal-vs-external delivery by that prefix (event.name.startsWith('${INTEGRATION_EVENT_PREFIX}') → ` +
					`ExternalMediator, else InternalMediator — DrizzleOutboxDispatcher, since 6b9c7578e), so an unprefixed integration ` +
					`event would be delivered in-process as a domain event and never cross the service boundary. ` +
					`Rename the \`name\` literal in packages/contracts/wire/events/*.tsp to "integration.<context>.<fact>".`,
			)
		}
	}
}
