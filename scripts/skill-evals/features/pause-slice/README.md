# pause-slice — feature-loop bundle (P1)

Verifier-authored acceptance bundle for `.specs/2026-06-10-billing-pause-slice-wiring.md`: a builder agent implements the spec; these artifacts decide whether it succeeded.
`ExternalSubscriptionUpdatedHandler.paused.red.ts` (`.red.ts` so root `bun test` never sweeps it) is the red acceptance test (AC1–AC3) the harness injects at `packages/api/typescript/src/billing/handlers/` — it must never live in the package suites on this branch while red.
`task.yaml` is the skill-evals Task: builder prompt, inject mapping, and graders (tsc, test-green, grep, detectors, judge) mapped to the spec's AC1–AC6.
Run via the skill-evals harness (`scripts/skill-evals/run.ts`) in agent mode from HEAD.
