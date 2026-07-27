/**
 * Single source of truth for bounded-context identity.
 *
 * Maps each context's FOLDER/import identity (`ContextModule`, i.e. `src/<module>/`) to its
 * RUNTIME name (`ContextName`, i.e. the string passed to `BoundedContext.create({ name })`,
 * which becomes both the `Router` path prefix (`/${name}`) and the OpenAPI tag for that context).
 *
 * Before this spine existed, the same name was re-declared by hand in several places (the
 * `name: '<x>'` literal in every `<context>/index.ts`, plus the folder name itself). This file
 * collapsed that to ONE declaration. To add or rename a context: edit ONLY the `CONTEXTS` object below. Every
 * consumer imports the value from here (`CONTEXTS.ui`, never the literal `'ui'`), so a typo or a
 * stale rename fails `tsc` at every call site instead of silently drifting out of sync.
 *
 * ONE routing convention (unified 2026-07-21): the router NEVER adds a mount prefix — every
 * controller carries its full version-relative path (`/quota/overrides`, `/ui/account`, …) and
 * `MainRouter` prepends only the version (`/v1/...`). The context NAME (passed to
 * `BoundedContext.create({ name })`, checked as a `ContextModule` literal) is pure identity: the
 * OpenAPI tag and the log label. URLs are exactly what the controller declares.
 */
export const CONTEXTS = {
	auth: { pgSchema: 'authentication' },
	owner: { pgSchema: 'owner' },
	shared: { pgSchema: 'shared' },
	// agent — the agent runtime: the one-method `AgentRunner` seam, the two internal agents
	// (`ClassifyIssueAgent` / `IssueWorkAgent`), the routing policy (`IssueRouter`) and provider
	// detection. Its outbound facts are the frozen `integration.issue.*` events on the shared outbox.
	//
	// Fase 5 of GOAL-agent-abstraction closed the split this entry used to carry: the pgSchema moved to
	// `agent` with the TABLE rename in Fase 4, and the MODULE KEY moves here with the
	// `git mv terminal → agent`. Key and schema now agree — which is exactly what the two rails that
	// cross-check them (pgSchema parity against the contracts schema files, and the cross-schema
	// TABLE_READ leg) were measuring all along.
	agent: { pgSchema: 'agent' },
	// BC2 Workspace Registry (TS-owned) — the `workspace` schema, promoted out of PENDING_PGSCHEMAS.
	workspace: { pgSchema: 'workspace' },
	// BC4 Thread & Routing (Core, TS-owned) — the `thread` schema, promoted out of PENDING_PGSCHEMAS.
	thread: { pgSchema: 'thread' },
	// BC5 Issue Execution (Core, TS-owned) — the `issue` schema, promoted out of PENDING_PGSCHEMAS.
	issue: { pgSchema: 'issue' },
	// BC6 Artifact Registry (Support, TS-owned) — the `artifact` schema, promoted out of PENDING_PGSCHEMAS.
	artifact: { pgSchema: 'artifact' },
	ui: { pgSchema: null },
	// external (reverse proxy) — the browser-facing door to the Go channel gateway (medscall
	// pattern): ONE wildcard ChannelProxy controller, no domain, no tables. pgSchema null like ui.
	external: { pgSchema: null },
} as const satisfies Record<string, ContextDecl>

/** Contract of one bounded-context declaration. `pgSchema` names the Postgres schema this context
 *  owns in packages/contracts/db/schema (null = read-side only, owns no tables — e.g. the ui BFF).
 *  The context-map rail asserts the declared schema set matches the contracts schema files. */
export interface ContextDecl {
	/** Postgres schema the context owns (null = no persistence, e.g. the ui BFF). */
	pgSchema: string | null
}

/**
 * Postgres schemas owned by NON-TS backends (declared intent, same rule as CONTEXTS.pgSchema:
 * a schema exists in contracts because some declared owner claims it). The Go backend owns
 * `gateway` (`internal/channel` — BC1, the Channel Gateway
 * read model written only by the Go worker's status projectors). The context-map rail unions this
 * with the TS declarations for its contracts-parity check.
 */
export const FOREIGN_PGSCHEMAS: readonly string[] = ['gateway']

/**
 * TS-owned Postgres schemas FORWARD-DECLARED by the Phase-0 contract lock: the schema exists in
 * contracts (packages/contracts/db/schema) AHEAD of its bounded-context implementation. Intent
 * precedes derivation — the schema is claimed here so the context-map parity rail stays green
 * until each context (its `src/<module>/` folder + router + registry) is built and PROMOTED into
 * CONTEXTS. When a context lands, move its schema OUT of this list and INTO CONTEXTS.pgSchema.
 * (CodeDM new contexts: workspace / thread / issue / artifact.)
 */
export const PENDING_PGSCHEMAS: readonly string[] = []

/** Folder/import identity — matches `src/<module>/` exactly (e.g. keys used by `@<module>/*` path aliases). */
export type ContextModule = keyof typeof CONTEXTS

/** Context name — passed to `BoundedContext.create({ name })` as pure identity (OpenAPI tag +
 *  log label; never a mount prefix). Identical to the module id. */
export type ContextName = ContextModule

/**
 * The RUNTIME half of `ContextName`, DERIVED from `CONTEXTS` — so a composition root can obey this
 * file's own rule ("every consumer imports the value from here, never the literal `'ui'`") instead of
 * re-typing its own name.
 *
 * Why it exists at all: the type `ContextName` has always been checkable, but there was no VALUE to
 * import, so all ten `<context>/index.ts` files passed a string literal to `BoundedContext.create`.
 * That is the exact drift this module was written to collapse — and Fase 5 of GOAL-agent-abstraction
 * (§5.1) proved it live: the module rename that produced the `agent` key above left the OLD name
 * compiling happily inside the renamed folder, because a bare literal is checked against `string`,
 * not against the keys of `CONTEXTS`. `CONTEXT_NAMES.agent` fails `tsc` at the call site the day the
 * key moves again.
 *
 * The single `as` is a DERIVATION cast, not an escape hatch: `Object.fromEntries` is typed
 * `[string, T][] → { [k: string]: T }` in lib.es2019, which erases the literal keys the mapped type
 * restores. There is no cast-free spelling that keeps ONE declaration — the alternative is a
 * hand-written second list of every context name, i.e. the duplication this file deletes.
 */
export const CONTEXT_NAMES = Object.fromEntries(Object.keys(CONTEXTS).map(key => [key, key])) as { readonly [K in ContextModule]: K }
