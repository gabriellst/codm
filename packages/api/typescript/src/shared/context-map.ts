import type { ContextModule } from './contexts'

/**
 * CONTEXT MAP — the DECLARED (intent-first) map of who may depend on whom, and the global policy of
 * which surfaces may cross a context boundary.
 *
 * DELIBERATELY NOT DERIVED from imports: intent must exist BEFORE derivation. A derived baseline
 * would bless the current state — accidents included — as fact; declaring first means writing this
 * map IS the audit: every real edge is either consciously declared here or the context-map rail
 * lights up. Derivation exists only as a conference tool (the rail diffs real imports against this
 * map), never as the source. (Decision 2026-07-21, .plans/2026-07-21-declarative-repo.md §F1a.2b.)
 *
 * Reading: outer key = CONSUMER (downstream); inner keys = SUPPLIERS (upstream) it may import from.
 * Edges are context PAIRS — surface granularity is governed by ONE global CROSS_CONTEXT_POLICY, not
 * per-edge channel lists. Exceptions to the policy are NAMED, per-file, with a why.
 */
export const CONTEXT_MAP: Partial<Record<ContextModule, Partial<Record<ContextModule, { note: string }>>>> = {
	owner: {
		auth: { note: 'OperatorMiddleware / owner tenancy read the session shape (SessionSchema from @auth/schemas).' },
	},
	thread: {
		workspace: { note: 'AttachThread validates the workspace exists via WorkspaceRepository (repositories surface).' },
		agent: {
			note: 'Classification/routing consumes the ProviderDetector + IssueRouter services of the agent context (IssueRouter drives ClassifyIssueAgent and applies the reply-quote / threshold / slug / clarify policy).',
		},
	},
	agent: {
		thread: {
			note: 'The severed-saga closer (RunIssueTurnOnClassification) resolves the run context — thread providers/workspaceId + the prompt from the transcript — via BC4 read seams (ThreadRepository/TranscriptRepository/OpenIssuesReader), and IssueRouter takes its OpenIssueRef shape from the same reader (the ref is a THREAD concept and lives there).',
		},
		workspace: { note: 'The saga-closer reads the bound workspace path (the run cwd) via WorkspaceRepository (repositories surface).' },
	},
	artifact: {
		thread: {
			note: 'RecordArtifact validates the target thread exists via ThreadRepository (the artifact catalog is a sink, not the owner).',
		},
		issue: { note: 'RecordArtifact validates the optional issue exists via IssueRepository (same sink posture).' },
	},
	ui: {
		owner: { note: 'BFF read model: owner listing/active-owner via repositories.' },
		agent: { note: 'BFF Settings/AttachWizard read provider availability via the ProviderDetector service (detection probe).' },
		issue: { note: 'BFF Settings reads the per-owner stop-policy toggles via StopPolicyConfigRepository (repositories surface).' },
	},
}

/**
 * TABLE-READ EDGES — cross-context dependencies that ride the DATABASE (drizzle tables imported
 * from @codedm/contracts/db) instead of code imports. The import-edge rail above cannot see them
 * (the audit's blind spot: sub-reported coupling erodes the "writing the map IS the audit"
 * guarantee), so they are DECLARED here and enforced by the table-read leg of
 * tests/architecture/context-map.test.ts, which resolves every imported table symbol to its owning
 * pgSchema. `schema` is the OWNING pgSchema name — a CONTEXTS.pgSchema value or a foreign schema
 * (FOREIGN_PGSCHEMAS, e.g. the Go gateway's).
 */
export const TABLE_READ_EDGES: readonly { consumer: ContextModule; schema: string; note: string }[] = [
	{
		consumer: 'issue',
		schema: 'thread',
		note: 'T04/T12 read models join threads + transcript entries for display fields (read-services cross-tabela, BUILD-LOG:64).',
	},
	{
		consumer: 'workspace',
		schema: 'thread',
		note: 'ListWorkspaces + WorkspaceUsageQuery count attached threads per workspace (BUILD-LOG:64).',
	},
	{ consumer: 'workspace', schema: 'issue', note: 'WorkspaceUsageQuery counts working issues per workspace (BUILD-LOG:64).' },
	{
		consumer: 'thread',
		schema: 'issue',
		note: 'OpenIssuesReader (classifier candidate set) + GetSessionChat active stops ride the issue schema.',
	},
	{ consumer: 'thread', schema: 'workspace', note: 'GetSessionChat resolves the bound workspace display path.' },
	{
		consumer: 'thread',
		schema: 'gateway',
		note: 'ChannelConnectivity / GroupMemberReader / GetSessionChat read the Go gateway sync tables (channels/remotes — proxy pairing, BUILD-LOG:116).',
	},
	{ consumer: 'ui', schema: 'thread', note: 'BFF read models (dashboard/wizard/checklist) — query-side by design.' },
	{ consumer: 'ui', schema: 'issue', note: 'BFF read models + BrowserFrameEnricher status derivation.' },
	{ consumer: 'ui', schema: 'workspace', note: 'BFF read models (dashboard/wizard/checklist).' },
	{ consumer: 'ui', schema: 'owner', note: 'GetSettings reads the owner row (timezone/language).' },
	{ consumer: 'ui', schema: 'gateway', note: 'BFF wizard/dashboard read the gateway sync tables (channels/remotes/memberships).' },
	{
		consumer: 'owner',
		schema: 'authentication',
		note: 'SetActiveOwner targeted single-column session update (better-auth hook pattern; no aggregate).',
	},
	{
		consumer: 'shared',
		schema: 'gateway',
		note: 'TestIngressController seeds a connected channel — CODEDM_E2E-gated hermetic seam, never mounted in production.',
	},
]

/**
 * Surfaces that may (and may NOT) cross a context boundary — ONE global policy, the house rule
 * "cross-context reads go through Repository/Service" made mechanical. `forbidden` is the load-
 * bearing half (user decision 2026-07-21): entities = write-model leak, usecases = cross-context
 * orchestration, handlers/events = wiring/domain-private (integration events cross via contracts).
 */
export const CROSS_CONTEXT_POLICY = {
	allowed: ['repositories', 'services', 'objects', 'enums', 'schemas', 'middlewares', 'i18n'],
	forbidden: ['entities', 'usecases', 'handlers', 'events', 'controllers', 'jobs', 'projections'],
} as const

/**
 * AMBIENT suppliers — importable by every context without a declared edge, on the listed surfaces
 * only. These are infrastructure roles, not dependencies: shared is the kernel-adjacent utility
 * context; auth's session middleware and owner's tenancy middleware guard rides on every router.
 */
export const AMBIENT: Partial<Record<ContextModule, readonly string[] | '*'>> = {
	shared: '*',
	auth: ['middlewares'],
	owner: ['middlewares'],
}

/**
 * NAMED exceptions to CROSS_CONTEXT_POLICY — each carries the file it lives in and the why. An
 * exception is a conscious decision with a review trail, never a silent branch. Liveness-gated:
 * an entry whose file/import no longer exists fails the rail (no fossil permissions).
 */
export const POLICY_EXCEPTIONS: readonly { file: string; imports: string; why: string }[] = []

/**
 * Cycles that are CONSCIOUS partnerships (DDD Partnership) rather than accidents. Any cycle in
 * CONTEXT_MAP not listed here fails the rail.
 */
export const ANNOTATED_CYCLES: readonly { between: readonly [ContextModule, ContextModule]; why: string }[] = [
	{
		between: ['agent', 'thread'],
		why: 'Partnership across the demux→execute seam, renamed with the context in Fase 5 (GOAL-agent-abstraction §5.1) — the EDGE is unchanged, only the name on one side of it. BC4 Thread & Routing consumes the agent context’s routing services (IssueRouter, which drives ClassifyIssueAgent, plus ProviderDetector) to make the routing decision, while the agent context’s saga-closer consumes BC4’s thread/transcript read seams to run the turn that decision triggers. Two halves of one classify→run boundary; integration events (message.classified / issue.opened) carry the runtime hand-off, the read seams only resolve context.',
	},
]

/**
 * Composition-root files EXCLUDED from edge checking — they exist to aggregate every context
 * (registries, routers) and are compile-checked against the CONTEXTS spine instead.
 */
export const BOOTSTRAP_FILES: readonly string[] = ['shared/registry.ts', 'shared/index.ts', 'routers.ts', 'index.ts']
