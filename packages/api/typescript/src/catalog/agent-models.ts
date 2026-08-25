import { ProviderKind, AgentModelId } from '@codm/contracts-typescript/wire/enums'

/**
 * WHICH MODELS EACH PROVIDER CLI OFFERS — a declared RELATION, never derived from a name.
 *
 * ### Why this exists at all
 * `AgentModelId` is one flat closed set, and by itself it cannot answer the only question the
 * selector asks: "what may I pick FOR THIS CLI?". `SONNET | OPUS | HAIKU` is not "the models" — it is
 * the models of ONE binary, which is exactly what `CLAUDE_MODEL_ALIASES` says in the runner
 * ("what this binary calls its models is a fact about claude and about nothing else"). The moment a
 * second provider gains a model, answering that question from the member NAME — a prefix, a regex, an
 * `if (provider === …)` at a call site — is the model-is-wrong shape the repo's fifth non-negotiable
 * forbids. So the ownership is DECLARED here, once, and every layer answers by lookup.
 *
 * `Record<ProviderKind, …>` rather than a partial map, deliberately: it is exhaustive, so a new
 * `ProviderKind` makes `tsc` demand its entry instead of silently resolving to `undefined` at one call
 * site and to a fallback at another. That exhaustiveness is what replaces the edge-case branch.
 *
 * ### Hand-authored here, in `api/typescript`, and why it is not emitted from TypeSpec — nor kept
 * ### inside `packages/contracts`
 * The wire pipeline (`codegen/lib/parse-openapi.ts`) emits three things — enums, unions and events —
 * and none of them carries VALUES for a relation. Emitting one would mean a fourth parsing axis plus
 * three new emitters for a fact that only the TypeScript daemon reads: the Go gateway never dispatches
 * an agent turn and neither does the Rust shell. That single-reader shape is also why this file does
 * NOT live in `packages/contracts` (moved out from there, founder decision) despite composing a
 * generated enum: `packages/contracts` is the cross-LANGUAGE contract boundary (wire enums, events, DB
 * schema — everything Go/Rust/TS all consume), and this catalog is consumed by exactly one runtime.
 * Living beside its only reader means a model added here needs no `bun contracts` regen to reach it.
 *
 * The redeclaration that buys — the enum in `.tsp`, the ownership here — is gated:
 * `agent-models.test.ts` fails on a model nobody assigned to a provider.
 *
 * ### `DEFAULT` is SHARED, and it is the one member that is
 * It means "omit `--model` and let the binary choose", which is the same instruction in every CLI.
 * A per-provider `CLAUDE_DEFAULT`/`CODEX_DEFAULT` would be N spellings of one fact — the defect the
 * `customPrompt` column documents at length — so it appears in every non-empty list instead.
 *
 * ### An EMPTY list means "there is nothing to choose", and it is a SEPARATE axis from `comingSoon`
 * Nobody has ever driven the codex or opencode binary from here, so this build does not know which
 * aliases they accept, and inventing a list would offer the operator a choice we cannot honour. The
 * console renders the selector iff the list is non-empty.
 *
 * That happens to coincide today with `comingSoon` (`AgentRunnerFactory.supported`), and the two are
 * kept apart on purpose: "can this engine drive the CLI?" is a fact about THIS deployment's wiring,
 * "what can be asked of it?" is a fact about the CLI. Collapsing them would make binding a runner
 * silently invent a model list.
 */
export const PROVIDER_MODELS: Readonly<Record<ProviderKind, readonly AgentModelId[]>> = {
	[ProviderKind.CLAUDE_CODE]: [AgentModelId.DEFAULT, AgentModelId.OPUS, AgentModelId.SONNET, AgentModelId.HAIKU],
	[ProviderKind.CODEX]: [],
	[ProviderKind.OPENCODE]: [],
}

/** The models `provider` offers. Empty ⇒ nothing to choose (see the header). */
export function modelsFor(provider: ProviderKind): readonly AgentModelId[] {
	return PROVIDER_MODELS[provider]
}

/** Whether `model` is one `provider` actually offers — the lookup every validator makes. */
export function offersModel(provider: ProviderKind, model: AgentModelId): boolean {
	return PROVIDER_MODELS[provider].includes(model)
}

/**
 * WHAT AN ABSENT CHOICE MEANS, stated once — `DEFAULT`, i.e. omit `--model` and let the CLI pick.
 *
 * It lives here rather than only on the `Thread` aggregate because two readers need it and only one of
 * them holds an entity: `Thread.modelFor` delegates to it, and the settings BFF reads the row straight
 * out of Drizzle (no aggregate hydrated, by design) and needs the same answer. Two `?? DEFAULT`s in two
 * layers is precisely how "absent means default" quietly becomes "absent means something else here".
 */
export function effectiveModel(chosen: Readonly<Partial<Record<ProviderKind, AgentModelId>>>, provider: ProviderKind): AgentModelId {
	return chosen[provider] ?? AgentModelId.DEFAULT
}

/**
 * The GATE, as a pure function so the negative fixture in the test exercises the SAME code the real
 * assertion does — a hand-rolled second implementation in the test would be the drift it is guarding.
 *
 * Three rules, and each one names a way the two declarations (the `.tsp` enum, the map above) can
 * fall out of step:
 *
 *  - `unowned` — a model member no provider claims. The one that actually happens: somebody adds
 *    `GPT_5` to the enum and forgets that the enum does not say whose it is.
 *  - `shared` — a model claimed by two providers. `DEFAULT` is the deliberate exception; anything else
 *    means the flat set is being used as if it were namespaced.
 *  - `missingDefault` — a non-empty list without `DEFAULT`. A provider that can be chosen but offers
 *    no way back to "let the CLI decide" strands whoever picked a model once.
 */
export function auditProviderModels(catalog: Readonly<Record<ProviderKind, readonly AgentModelId[]>>): {
	unowned: AgentModelId[]
	shared: AgentModelId[]
	duplicated: ProviderKind[]
	missingDefault: ProviderKind[]
} {
	const owners = new Map<AgentModelId, ProviderKind[]>()
	const duplicated: ProviderKind[] = []
	const missingDefault: ProviderKind[] = []

	for (const provider of Object.values(ProviderKind)) {
		const models = catalog[provider]
		if (new Set(models).size !== models.length) duplicated.push(provider)
		if (models.length > 0 && !models.includes(AgentModelId.DEFAULT)) missingDefault.push(provider)
		for (const model of models) {
			if (model === AgentModelId.DEFAULT) continue
			owners.set(model, [...(owners.get(model) ?? []), provider])
		}
	}

	const unowned = Object.values(AgentModelId).filter(model => model !== AgentModelId.DEFAULT && !owners.has(model))
	const shared = [...owners].filter(([, providers]) => providers.length > 1).map(([model]) => model)

	return { unowned, shared, duplicated, missingDefault }
}
