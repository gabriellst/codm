/**
 * SQLite-dialect schema — the go-domain port substrate (Phase 0.1, ADDITIVE).
 *
 * A one-flat-dialect mirror of the pg schema at db/schema/ (Option A,
 * go-domain-design.md decision (a)): the 9 pgSchema namespaces collapse to
 * table-name prefixes (owner_/authentication_/workspace_/thread_/issue_/agent_/
 * artifact_/gateway_/shared_), enums become text + CHECK, and pg types map
 * uuid→text · timestamptz→integer{timestamp_ms} · jsonb→text{json} ·
 * text[]→text{json} · bigint→integer · boolean→integer{boolean}.
 *
 * NOTHING imports the pg schema THROUGH here — db/schema/ stays the source of
 * truth for the running TS daemon until Phase C. This file backs only the sqlite
 * migration + sqlc pull consumed by core-go's SqliteStore.
 */
export * from './owner'
export * from './auth'
export * from './infrastructure'

export * from './workspace'
export * from './thread'
export * from './issue'
export * from './agent'
export * from './artifact'

export * from './channel'
