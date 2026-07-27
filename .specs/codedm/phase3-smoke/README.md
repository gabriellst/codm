# FASE 3 — vertical smoke with the REAL `claude` (AC-3.6, second half)

`SOURCE: measured` — run against the installed binary, not derived from the spec.

## What was run

```
cd packages/api/typescript
env -u CLAUDECODE -u CLAUDE_CODE_SSE_PORT bun scripts/phase3-smoke.ts
```

Script: `packages/api/typescript/scripts/phase3-smoke.ts`. Raw report: `raw/vertical.json`.

**Why the script does not live here, unlike the Fase-2 one.** The Fase-2 smoke imported nothing but
`node:*` and spawned the binary itself, so it ran fine from `.specs/`. This one drives the two
MIGRATED CONSUMERS (`IssueClassifier`, and `run()` as `RunIssueTurn` calls it), so it imports
`reflect-metadata` and `@codedm/core-typescript` — which resolve only from inside
`packages/api/typescript/node_modules` (they are not hoisted to the repo root). The record stays here;
the executable sits where its imports resolve.

**Why it does not boot the whole daemon.** The HTTP test-ingress that seeds an inbound message is
guarded by `CODEDM_E2E=true`, and that same flag swaps `StreamJsonAgentRunner` out for the e2e stub
(`terminal/registry.ts`). Booting the daemon to reach the ingress would *guarantee* the CLI is never
spawned — the opposite of what this smoke exists to prove. The remainder of the chain (outbox →
bridge → integration events → issue row) is covered deterministically by the runtime e2e
(`packages/e2e/tests/04-inbound-issue.spec.ts`), which is not degradable.

## Result — `verdict: OK`

| Leg | What it exercises | Outcome |
|---|---|---|
| 1. inbound → issue | `IssueClassifier.classify` = `run({ outputSchema })`, no `mcp` | `NEW_ISSUE`, slug `fix-unresponsive-login-button-click`, 6850 ms |
| 2. issue → reply | `run()` with no `outputSchema`, scratch cwd, 4 transport frames | `COMPLETED`, reply text drafted, 5661 ms |

Inbound message: *"the login button does nothing when I click it — please fix"*.

## The defect this smoke found — and it is a CONTRACT defect

**First run: `ATTEMPT-FAILED`, `CLASSIFICATION_FAILED: terminal reply text was not JSON`.**

Isolated with a direct `run({ outputSchema })` against the real binary, the terminal record was:

```json
{
  "outcome": "COMPLETED",
  "replyText": "NEW_ISSUE: Fix unresponsive login button click",
  "failed": true,
  "failure": "terminal reply text was not JSON"
}
```

The model produced a **correct decision, in prose**. Nothing in the pipeline had ever told it to
answer in JSON.

**Where the contract is wrong.** §4.2 justifies deleting `extractJson` (the shrinking-window JSON
scavenger) like this: *"com stream-json o texto final do assistant vem já delimitado por frame, e a
validação é `outputSchema.safeParse` sobre ele."* That reasoning is **half true**: framing settles
where the text *ends*; it says nothing about whether the text *is JSON*. With the scavenger deleted
and no instruction added, the structured half of the seam could not work at all against a real CLI.

This was latent from Fase 2 — `generate()` became an adapter over `run()` there — and could not have
been caught earlier, because §8 rule 8 forbids any test from spawning a provider CLI, and the Fase-2
smoke only captured raw frames. AC-3.6's smoke is the first time the structured path met the binary.

**The repair, and why it is not a re-introduction of what died.** `StreamJsonAgentRunner` now appends
a `structuredOutputDirective(schema)` when — and only when — `request.outputSchema` is present: a
JSON-only instruction carrying the **JSON Schema derived from the same Zod object that validates the
reply** (`z.toJSONSchema`), so there is one source of truth rather than a prose paraphrase that
drifts. It lives in the runner because §4.2 calls `outputSchema` *"o ÚNICO botão que faz disto
classificação"*, and a switch every caller must also remember to explain in its own prompt is not a
switch. It is appended **last**, after the turn body, for instruction recency.

`extractJson` stays deleted. The fix is to make the model emit JSON, not to resume excavating JSON out
of prose — the parse remains a strict `JSON.parse` + `safeParse`, and a non-conforming reply still
surfaces as `failed: true` on the terminal event rather than as a throw (§4.3 rule 4).

Measured after the repair:

```json
{
  "replyText": "{\"decision\":\"NEW_ISSUE\",\"issueId\":null,\"confidence\":null,\"title\":\"Fix unresponsive login button click handler\",\"question\":null}",
  "output": { "decision": "NEW_ISSUE", "title": "Fix unresponsive login button click handler" },
  "failed": false
}
```

Regression-locked by two unit tests over the fake process in
`StreamJsonAgentRunner.test.ts` (directive present with an `outputSchema` and carrying the derived
schema; absent without one).
