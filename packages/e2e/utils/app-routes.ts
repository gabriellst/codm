/**
 * Types-only mirror of the app-react route union.
 *
 * Why this exists: the e2e utils need `FileRouteTypes['to']` (the compile-time
 * union of navigable route paths) for typed `goto()` / `routeParams()`. Importing
 * it directly from `../../app/react/src/routeTree.gen` drags the entire app-react
 * source graph — every route `.tsx`, each using `@/*` path aliases — into the e2e
 * tsconfig, which has neither `jsx` nor those path mappings, turning `e2e:tsc` red.
 *
 * This barrel carries ONLY the `to` union, references no `.tsx` module, and keeps
 * `e2e:tsc` decoupled from app-react's source. Mirror it whenever routes change
 * (source: `FileRouteTypes['to']` in packages/app/react/src/routeTree.gen.ts).
 */
export interface FileRouteTypes {
	to:
		| '/'
		| '/attach'
		| '/onboarding'
		| '/styleguide'
		| '/channels'
		| '/dashboard'
		| '/issues'
		| '/settings'
		| '/workspaces'
		| '/settings/account'
		| '/threads/$threadId'
		| '/threads/$threadId/artifacts'
		| '/threads/$threadId/issues'
		| '/threads/$threadId/issues/$issueId'
}
