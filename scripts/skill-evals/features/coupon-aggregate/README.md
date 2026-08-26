# coupon-aggregate — feature-loop bundle

Verifier-authored acceptance bundle for `.specs/2026-06-10-sales-coupon-aggregate.md`: a builder agent implements the spec; these artifacts decide whether it succeeded.
`Coupon.red.ts` (unit, AC1–AC9; `.red.ts` so root `bun test` never sweeps it — injected as Coupon.test.ts) injects at `packages/api/typescript/src/sales/entities/`; `coupon-usecases.red.ts` (integration TestBed, AC10–AC13) injects at `packages/api/typescript/src/sales/usecases/coupon-acceptance.test.ts` — both red at base, never committed inside packages/ on this branch.
`task.yaml` is the skill-evals Task: builder prompt (full spec restatement), inject mapping, and graders (tsc, test-green ×2, grep, file-exists, detectors, judge) mapped to the spec's AC1–AC16 and the feature's axis scenarios.
Run via the skill-evals harness (`scripts/skill-evals/run.ts`) in agent mode from HEAD.
