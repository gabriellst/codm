import { BaseAgentInputSchema } from '@codm/core-typescript'
import type { z as Z, ZodObject, ZodRawShape } from 'zod'

/**
 * The agent-input envelope + the constraint that keeps it READABLE through a generic
 * (GOAL-agent-abstraction §4.6, Fase 1 contract lock).
 *
 * CONTEXT-ORIGIN: medscall `packages/api/src/agent/types/AgentInputSchemaConstraint.ts`
 * @ c58ed45677c473b0415c03cfc741fea3a00946f4 — technique copied, field set NOT (see
 * `BaseAgentInputSchema` in core for why the CODM envelope is `{ownerId, issueId, threadId, cwd}`).
 *
 * The problem this closes, verbatim from the medscall finding: TypeScript's generic narrowing of
 * `z.output<InputSchema>` alone collapses to `Record<string, unknown>` under constraint erasure,
 * losing the envelope fields. Without the pair below, anything generic over an agent's input schema
 * — the base `Agent`, the runner adapters — has to cast its way to `input.cwd`, discarding exactly
 * the type safety the schema existed to provide, at the layer that handles identity. AC-1.4 is the
 * executable proof that it does not have to; the literal escape-hatch spellings are deliberately
 * absent from this whole context, and the grep in that AC is what keeps them absent.
 *
 * Re-exported from here (rather than defined here) because `z.agentInput()` has to `.extend()` the
 * same object, and `z` is assembled in core: one definition, one truth.
 */
export { BaseAgentInputSchema }

/**
 * Alias kept for symmetry with the medscall vocabulary and for the day a CODM-wide input field is
 * added that is NOT part of the core envelope. Today it is exactly the envelope.
 */
export const AgentInputSchema = BaseAgentInputSchema

/**
 * The runtime envelope every agent input carries. INTERSECT this with `z.output<InputSchema>`
 * wherever a generic input is consumed — the intersection is what restores `ownerId` / `issueId` /
 * `threadId` / `cwd` at the type level after constraint erasure.
 */
export type AgentInputEnvelope = Z.output<typeof AgentInputSchema>

/**
 * The constraint every agent input schema satisfies: a `ZodObject` whose shape EXTENDS the
 * envelope's. `z.agentInput({...})` returns exactly `ZodObject<envelopeShape & T>`, so the
 * constraint holds by construction — an agent physically cannot declare an input that drops the
 * envelope.
 *
 * Arity note (the escape hatch the goal reserved, resolved and recorded): zod 4.4.3 declares
 * `ZodObject<out Shape extends $ZodShape = $ZodLooseShape, out Config extends $ZodObjectConfig =
 * $strip>`. `Config` DEFAULTS to `$strip`, which is exactly what `z.object()` / `.extend()` produce,
 * so the one-parameter form below type-checks as written and no second parameter is needed. `Shape`
 * is covariant (`out`), which is why `ZodObject<envelope & T>` is assignable to
 * `ZodObject<envelope & ZodRawShape>` for any `T extends ZodRawShape`.
 */
export type AgentInputSchemaConstraint = ZodObject<(typeof BaseAgentInputSchema)['shape'] & ZodRawShape>
