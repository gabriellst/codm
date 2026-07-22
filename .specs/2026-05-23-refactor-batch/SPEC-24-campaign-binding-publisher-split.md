# SPEC-24: Split `CampaignProductBindingPublisher` into per-event handlers

**Wave:** 5   **Stream:** B   **Depends on:** SPEC-12   **Status:** done

## Motivation

`packages/api/typescript/src/marketing/handlers/CampaignProductBindingPublisher.ts` has two `@injectable()` classes in one file:
- `OnCampaignProductBindingCreatedPublish`
- `OnCampaignProductBindingRemovedPublish`

This violates the "one handler per event name, one class per file" rule established in SPEC-12. The canonical fix: split into two files under a folder if both effects ever share state, or two flat files if they don't.

Currently both classes only:
1. Compute the `ownerId` from the source domain event.
2. Publish a corresponding integration event.

No shared state. Two flat files is the right shape.

## Scope

Replace `packages/api/typescript/src/marketing/handlers/CampaignProductBindingPublisher.ts` with:

- `marketing/handlers/CampaignProductBindingCreatedHandler.ts` — handles `CampaignProductBindingCreatedEvent`, publishes integration event
- `marketing/handlers/CampaignProductBindingRemovedHandler.ts` — handles `CampaignProductBindingRemovedEvent`, publishes integration event

Update `marketing/handlers/internal.ts` (or `external.ts` depending on whether these are domain-event handlers — verify) to export both new class names, drop the old file's exports.

Delete `CampaignProductBindingPublisher.ts`.

Tests:
- If `CampaignProductBindingPublisher.test.ts` exists, split into two test files matching the new shape.

## Affected files

- `packages/api/typescript/src/marketing/handlers/CampaignProductBindingPublisher.ts` — DELETE
- `packages/api/typescript/src/marketing/handlers/CampaignProductBindingCreatedHandler.ts` — NEW
- `packages/api/typescript/src/marketing/handlers/CampaignProductBindingRemovedHandler.ts` — NEW
- `packages/api/typescript/src/marketing/handlers/internal.ts` (or `external.ts`) — exports
- `packages/api/typescript/src/marketing/handlers/CampaignProductBindingPublisher.test.ts` (if exists) — DELETE
- `packages/api/typescript/src/marketing/handlers/CampaignProductBindingCreatedHandler.test.ts` — NEW
- `packages/api/typescript/src/marketing/handlers/CampaignProductBindingRemovedHandler.test.ts` — NEW

## Acceptance criteria

- [ ] Original `CampaignProductBindingPublisher.ts` deleted.
- [ ] Two new handler files exist, each with exactly one `@injectable()` class.
- [ ] Barrel exports updated.
- [ ] Tests pass.
- [ ] `bun tsc` clean.
- [ ] `bun run test` clean.

## Out of scope

- Refactoring the integration events themselves (still `integration.shared.marketing.campaign_product_binding_{created,removed}`).
- Adding new handlers for unrelated events.

## Notes

- This spec exists as a canonical instance of SPEC-12's "one handler per event name" rule. Other multi-class-per-file violations get caught and fixed by SPEC-12's audit; this one is called out because it's the user-cited example.
- If during audit SPEC-12 finds the `SubscriptionQuotaUpdatedPublisher.ts` (4 handlers in one file) follows the same anti-pattern, that's NOT in this spec — SPEC-12 handles it as part of the general migration.
