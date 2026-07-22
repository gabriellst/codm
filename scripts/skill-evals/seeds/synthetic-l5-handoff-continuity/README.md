# synthetic-l5-handoff-continuity — seed bundle

L5 handoff-continuity probe (PROBES-BACKLOG.md#L5). Agent A built the **write-side
half** of the Sales coupon slice and wrote `HANDOFF.md`; agent B (the builder under
test, fresh context) must **finish the orchestration half from the handoff alone** —
not restart. Graded on the COMBINED tree by the same gates a full build would pass
(the oracle named in the backlog: "the composition probe's graders on the COMBINED
tree"), plus restart/duplicate guards.

## Files injected into the tree (BEFORE the builder runs)

The runner seeds these via `inject:` in `synthetic-l5-handoff-continuity.yaml`. They
are real, compiling, **green** write-side artifacts plus the handoff doc:

| from (this dir) | to (tree-relative) | role |
|---|---|---|
| `entities/Coupon.ts` | `packages/api/typescript/src/sales/entities/Coupon.ts` | aggregate (DONE) |
| `entities/index.ts` | `packages/api/typescript/src/sales/entities/index.ts` | barrel (merged: OrderOverride + Coupon) |
| `enums/CouponType.ts` | `…/src/sales/enums/CouponType.ts` | enum (DONE) |
| `enums/CouponStatus.ts` | `…/src/sales/enums/CouponStatus.ts` | enum (DONE) |
| `enums/index.ts` | `…/src/sales/enums/index.ts` | enums barrel |
| `events/CouponCreatedEvent.ts` | `…/src/sales/events/CouponCreatedEvent.ts` | event (DONE) |
| `events/CouponDeactivatedEvent.ts` | `…/src/sales/events/CouponDeactivatedEvent.ts` | event (DONE) |
| `events/index.ts` | `…/src/sales/events/index.ts` | barrel (merged: OrderOverridden + Coupon events) |
| `errors/index.ts` | `…/src/sales/errors/index.ts` | errors (merged: OrderOverride + coupon codes + HTTP map) |
| `entities/Coupon.test.ts` (= the verifier's `Coupon.red.ts`) | `…/src/sales/entities/Coupon.test.ts` | seeded-half unit suite, green |
| `HANDOFF.md` | `.handoff/coupon-slice.md` | the handoff doc the builder finishes from |
| `coupon-acceptance.test.ts` (= the verifier's `coupon-usecases.red.ts`) | `…/src/sales/usecases/coupon-acceptance.test.ts` | RED verdict suite for the builder's half (AC10–AC13) |

The two test files are reused verbatim from
`scripts/skill-evals/features/coupon-aggregate/` (the feature-loop verifier corpus):
`Coupon.red.ts` is **already green** against the seeded entity (proven: 19 pass at
authoring time); `coupon-usecases.red.ts` is **RED** until the builder lands the
use-cases + repository + migration.

## Empirically verified at authoring (2026-06-13)

With the write-side half copied into the live sales tree:
- `bun test src/sales/entities/Coupon.test.ts` → 19 pass (seeded entity is correct).
- `bun test src/sales` → 87 pass (no regressions; the merged barrels/errors compile).
- `bun x tsc -p tsconfig.build.json --noEmit` → exit 0 (seeded source is self-contained).
- `import-direction --all`, `registry-scan --all` → exit 0 (clean slice).

Then reverted — the seed lives ONLY here and is injected at run time; nothing coupon
exists in the tree at HEAD (free real estate for every agent-half grader).

## Why this is the L5 shape

The discriminator is NOT "can it build a coupon slice" (the feature-loop probe already
measures that). It is: given a half-built slice + a handoff, does the builder
**continue** (import the seeded `Coupon`/enums/events, wire the command side) rather
than **restart** (re-declare the aggregate, fork a second enums folder, re-author the
errors union)? The restart/duplicate guards + the judge's continuity axis carry that;
the combined-tree gates (tsc + both test suites green) carry the composition oracle.
