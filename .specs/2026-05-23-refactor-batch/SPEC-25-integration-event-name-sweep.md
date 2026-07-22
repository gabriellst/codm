# SPEC-25: Integration-event constructor `name:` sweep (carry-over)

**Wave:** 1   **Depends on:** none   **Status:** done

## Motivation

`BaseIntegrationEvent.constructor` was tightened to `Omit<z.infer<EventSchema>, 'name'>` in a prior session — the static `name` on each subclass already provides the wire name, and `BaseEvent.constructor` sets `this.name = this.constructor.name`. Most production sites and a few test files were updated. **5 test files still pass `name: 'integration.shared.X'` at construction time and will tsc-error.**

This is the unfinished tail of that change.

## Scope

Remove the `name: 'integration.shared.X'` line from each of these test-helper / test-case constructions:

- `packages/api/typescript/src/sales/handlers/OnOrderUpdatedLinkCart.test.ts` — function `orderEvent(...)`, drop `name:` line at the `new OrderUpdatedEvent({ ... })`
- `packages/api/typescript/src/integration/handlers/external.test.ts` — drop `name:` from each of the 6 `new IntegrationHandshake*Event({...})` / `new IntegrationLastSyncUpdatedEvent({...})` constructions (lines ~64, 84, 107, 128, 150, 167, 185)
- `packages/api/typescript/src/integration/entities/MarketingAdAccount.test.ts` — `discovered()` helper, drop `name:` line and the trailing `as any` cast since it no longer needs to bypass excess-property checks
- `packages/api/typescript/src/notifications/handlers/OnOrderUpdatedNotify.test.ts` — `orderEvent()` helper, drop `name:` line
- `packages/api/typescript/src/notifications/handlers/OnIntegrationHandshakeFailedNotify.test.ts` — `failedEvent()` helper, drop `name:` line

## Affected files

Listed above. To verify completeness after the edits:
```
rg "name:\s*'integration\." packages/api/typescript/src --type ts | rg -v "core/src/utils/schema/integrationEvent.test.ts"
```
Should return zero matches. The `integrationEvent.test.ts` file in core tests schema-level `.parse(...)` of integration events and SHOULD keep `name:` — that's the wire-shape contract, not a constructor.

## Acceptance criteria

- [ ] All 5 test files updated; `name:` line removed in each construction.
- [ ] `MarketingAdAccount.test.ts` no longer has the trailing `as any` on the helper.
- [ ] `rg "name:\s*'integration\." packages/api/typescript/src --type ts | rg -v "integrationEvent.test.ts"` returns zero matches.
- [ ] `bun tsc` clean.
- [ ] `bun run test` for these 5 files passes.

## Out of scope

- The core `integrationEvent.test.ts` file (it must keep `name:` for schema-parsing tests).
- Any production handlers — already swept in the prior session.
- Adding new tests.

## Notes

- After this lands, `BaseIntegrationEvent.ts` constructor signature `Omit<z.infer<EventSchema>, 'name'>` already in place — no framework change needed.
- The static `name` on each integration event subclass (e.g. `static override readonly name = 'integration.shared.X' as const`) provides the wire name via `BaseEvent.constructor` setting `this.name = this.constructor.name`.
