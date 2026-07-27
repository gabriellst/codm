/**
 * AC-1.4 — THE TYPE HOLE IS CLOSED. A COMPILE-TIME artifact, not a runtime suite.
 *
 * This file is load-bearing under the authoritative type-check: `tsconfig.build.json` includes
 * `tests/**\/*.ts` and excludes only `*.test.ts`, so `bun tsc` compiles everything below. It carries
 * no `expect()` and no runtime assertions — **`bun tsc` going green IS the assertion**, and `bun tsc`
 * going red is the failure report. (Molde: `tests/architecture/union-narrowing.typecheck.ts`.)
 *
 * THE HOLE, precisely. A runner — or the base `Agent`, or anything else generic over an agent's input
 * schema — is written as `<InputSchema extends AgentInputSchemaConstraint>`. Inside that generic,
 * `z.output<InputSchema>` collapses to `Record<string, unknown>` under constraint erasure: the
 * envelope fields vanish and `input.cwd` becomes an error. The historical "fix" is an escape-hatch
 * cast, which discards exactly the type safety the schema existed to provide, at the layer that
 * handles identity. The medscall finding states it verbatim: *"TypeScript's generic narrowing of
 * `z.output<InputSchema>` alone collapses to `Record<string, unknown>` under constraint erasure,
 * losing the envelope fields."*
 *
 * THE CLOSURE has two halves, and both are exercised below:
 *   1. `z.agentInput({...})` returns `ZodObject<envelopeShape & T>`, so the CONCRETE schema type still
 *      carries the envelope.
 *   2. `z.output<S> & AgentInputEnvelope` restores those fields INSIDE a generic — the shape every
 *      future consumer copies.
 *
 * NOT ONE CAST APPEARS BELOW — not `as`, and none of the escape-hatch spellings AC-1.4 greps for.
 * That absence is the other half of the AC, and it is mechanically checkable.
 */
import type Z from 'zod'
import { z } from '@codedm/core-typescript'
import type { AgentInputEnvelope, AgentInputSchemaConstraint } from '@terminal/types'

// ── CONCRETE: an agent declares its input with the verb, and gets the envelope for free ──────────

/**
 * A realistic agent input: the envelope (from `z.agentInput`) plus this agent's own fields. Nothing
 * here restates `ownerId` / `issueId` / `threadId` / `cwd` — that is exactly what the verb buys.
 */
const ClassifyIssueInputSchema = z.agentInput({
	messageText: z.string(),
	openIssueKeys: z.array(z.string()),
})

type ClassifyIssueInput = Z.output<typeof ClassifyIssueInputSchema>

/** The envelope is readable on the CONCRETE type — no cast, no intersection needed. */
export function readEnvelopeFromConcreteInput(input: ClassifyIssueInput): { cwdLength: number; ownerId: string; issueId: string } {
	return {
		cwdLength: input.cwd.length, // ← AC-1.4: `input.cwd.length`
		ownerId: input.ownerId, // ← AC-1.4: `input.ownerId`
		issueId: input.issueId, // ← AC-1.4: `input.issueId`
	}
}

/** The agent's OWN fields survive alongside the envelope — the verb extends, it does not replace. */
export function readOwnFieldsFromConcreteInput(input: ClassifyIssueInput): string {
	return `${input.messageText}:${input.openIssueKeys.length}:${input.threadId}`
}

/** And the schema satisfies the constraint BY CONSTRUCTION — this assignment is the proof. */
export const classifyInputSatisfiesConstraint: AgentInputSchemaConstraint = ClassifyIssueInputSchema

// ── GENERIC: the position that used to force an escape-hatch cast ────────────────────────────────

/**
 * A function generic over ANY agent input schema that still has to read the envelope.
 * `z.output<S> & AgentInputEnvelope` is the whole technique — the intersection restores what
 * constraint erasure removed, and it is what the base `Agent`'s `input` phantom will carry.
 */
export function readEnvelopeThroughGeneric<S extends AgentInputSchemaConstraint>(
	_schema: S,
	input: Z.output<S> & AgentInputEnvelope,
): { cwdLength: number; ownerId: string; issueId: string; threadId: string } {
	return {
		cwdLength: input.cwd.length,
		ownerId: input.ownerId,
		issueId: input.issueId,
		threadId: input.threadId,
	}
}

/** A concrete schema flows into the generic position without a cast — the two halves compose. */
export function callGenericWithConcreteSchema(input: ClassifyIssueInput): number {
	return readEnvelopeThroughGeneric(ClassifyIssueInputSchema, input).cwdLength
}

// ── The envelope's own contract, pinned at the type level ────────────────────────────────────────

/**
 * `cwd` is NEVER optional: a `cwd?` silently degrades to `process.cwd()`, the worst possible default
 * in a product that runs inside the user's real repositories. The return type below stops compiling
 * the day the field is widened to `string | undefined`.
 */
export function cwdIsRequired(envelope: AgentInputEnvelope): string {
	return envelope.cwd
}

/** `context` IS the open slot — optional, and where multi-tenant agent config lands (D10). */
export function contextIsOptional(envelope: AgentInputEnvelope): Record<string, unknown> | undefined {
	return envelope.context
}

/**
 * `ownerId` is a uuid STRING at runtime, and the same value the run token's claims carry (§4.6). This
 * pins the output type: were it ever branded or widened, the assignment would fail here first.
 */
export function envelopeIdsAreStrings(envelope: AgentInputEnvelope): [string, string, string] {
	return [envelope.ownerId, envelope.issueId, envelope.threadId]
}
