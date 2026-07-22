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
	notifications: { pgSchema: 'notifications' },
	owner: { pgSchema: 'owner' },
	shared: { pgSchema: 'shared' },
	ui: { pgSchema: null },
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
 * a schema exists in contracts because some declared owner claims it). The Go backend's
 * `internal/activity` context owns `activity`. The context-map rail unions this with the TS
 * declarations for its contracts-parity check.
 */
export const FOREIGN_PGSCHEMAS: readonly string[] = ['activity']

/** Folder/import identity — matches `src/<module>/` exactly (e.g. keys used by `@<module>/*` path aliases). */
export type ContextModule = keyof typeof CONTEXTS

/** Context name — passed to `BoundedContext.create({ name })` as pure identity (OpenAPI tag +
 *  log label; never a mount prefix). Identical to the module id. */
export type ContextName = ContextModule
