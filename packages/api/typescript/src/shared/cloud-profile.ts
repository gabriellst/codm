// src/shared/cloud-profile.ts — the CODM_PROFILE=cloud filter (SP2 Decision 2: a lean
// docker-compose/Railway deploy that serves ONLY identity (auth) + tenancy (owner), sharing the
// same api-typescript entrypoint as the desktop daemon build). Task T4 of
// .plans/2026-08-06-sp2-conta-oauth.md; spec .specs/2026-08-06-sp2-conta-oauth-design.md.
//
// Pulled OUT of src/index.ts (rather than declared inline) because src/index.ts is NOT test-safe
// to import: `./boot` (a side-effecting module) and `start().catch(...)` both run at import time,
// so a test importing src/index.ts would try to boot the real daemon. This module is pure
// (functions + a Set, no side effects), so tests/architecture/cloud-profile.test.ts can import it
// directly. src/index.ts imports from here instead of re-declaring the filter.
//
// SCOPE OF WHAT IS FILTERED (T4): `filterRoutersForCloudProfile` narrows which context ROUTERS
// mount an HTTP route — src/index.ts reuses its result for BOTH `openapi.generateSpecification`
// (so a cloud boot documents only auth+owner+shared) AND `MainRouter` (so it serves only their
// routes) — plus src/index.ts separately gates the mailbox dispatcher start/stop and the agent
// runtime shutdown step, since those are plain resolve+start calls, not router-mounted
// controllers. `routers.ts` stays the ONE manifest-checked composition root for every profile:
// every context module still evaluates (its own DI bindings/handlers still register) when
// `./routers` is imported — this filters the HTTP surface + the mailbox poller, not which context
// MODULES load. Splitting `routers.ts` itself per profile (so an excluded context's module never
// even loads) is a deeper, follow-up process-level isolation and out of this task's scope.
import type { ContextModule } from './contexts'

/**
 * Contexts mounted when CODM_PROFILE=cloud. `shared` stays — it's the root/infra context (DB
 * migrations, outbox, health checks). Everything else (agent/workspace/thread/issue/artifact/ui/
 * external) is desktop-daemon-only: no agent runtime (mailbox/MCP/provider CLIs), no channel
 * gateway, no thread/issue/workspace/ui BFF.
 *
 * This is also the falsifier for AC-1 ("CODM_PROFILE=cloud sobe um processo que monta APENAS
 * auth+owner"): tests/architecture/cloud-profile.test.ts asserts this set EQUALS exactly
 * {auth, owner, shared} — widening it (e.g. adding 'agent' back) fails that rail.
 */
export const CLOUD_CONTEXTS: ReadonlySet<ContextModule> = new Set<ContextModule>(['auth', 'owner', 'shared'])

/**
 * `env` defaults to `process.env` — parameterized so a test can assert the boolean without
 * mutating the real process environment.
 */
export function isCloudProfile(env: NodeJS.ProcessEnv = process.env): boolean {
	return env.CODM_PROFILE === 'cloud'
}

/**
 * Filters a list of context-named items (routers, today — anything carrying a `.name` that is a
 * `ContextModule` string) down to `CLOUD_CONTEXTS`. A NO-OP for any profile other than the literal
 * string `'cloud'` — the default (desktop daemon) profile always keeps every item, unchanged, so
 * booting without CODM_PROFILE is zero behavior change.
 */
export function filterRoutersForCloudProfile<T extends { name: string }>(items: readonly T[], profile: string | undefined): T[] {
	if (profile !== 'cloud') return [...items]
	return items.filter(item => CLOUD_CONTEXTS.has(item.name as ContextModule))
}
