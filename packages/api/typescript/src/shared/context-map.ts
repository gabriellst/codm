import type { ContextModule } from './contexts'

/**
 * Why the MCP exposure scan imports another context's controllers — written once and cited by both the
 * declared edges and the named policy exceptions below, so the two can never drift apart.
 */
const NOTE_MCP_EXPOSURE =
	"The MCP exposure scan (agent/mcp/exposure.ts) imports each context's `controllers/index.ts` BARREL in order to READ each class's `static mcpScopes` — discovery, not declaration. Nothing is constructed, nothing is invoked, no state crosses; the association scope↔controller lives on the controller itself, which is the founder amendment this replaced the manifest with. The barrel is the whole set because WIRE-03 already requires every Controller subclass to be exported from it. It is confined to ONE file so a prompt builder never has to import another context's barrel to name a tool. The runtime path is the opposite of an import: tool → HTTP → that context's own controller → its own use case."

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
		issue: {
			note: "RaiseStop's archived guard READS the issue via IssueRepository (repositories surface) when the stop carries one — the sanctioned cross-context shape. The stop control plane lives here since B4 because the Stop is a child of the Thread aggregate; it never calls an issue entity method, only reads the flag.",
		},
		agent: {
			note: 'The inbound path consumes the agent context ProviderDetector (which CLI a thread runs) and, since the orchestrator pivot, its MailboxRepository — an invocable message queues a turn in the SAME transaction as the transcript entry (§7.4).',
		},
	},
	agent: {
		artifact: { note: NOTE_MCP_EXPOSURE },
		issue: { note: NOTE_MCP_EXPOSURE },
		ui: { note: NOTE_MCP_EXPOSURE },
		owner: { note: NOTE_MCP_EXPOSURE },
		thread: {
			note: "The MailboxDispatcher resolves each turn run context — thread providers/workspaceId, and the conversation window — via BC4 read seams (ThreadRepository/OpenIssuesReader; the transcript window is the thread aggregate's own persistence surface since B4). ForkIssue slugs an issue key against the same reader (an open issue of a thread is a THREAD concept and lives there).",
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
		thread: {
			note: 'BFF Settings reads the per-owner stop-policy toggles via StopPolicyConfigRepository (repositories surface), which lives in thread/ since B4 — the policy follows the aggregate that raises stops.',
		},
	},
}

/**
 * TABLE-READ EDGES — cross-context dependencies that ride the DATABASE (drizzle tables imported
 * from @codm/contracts/db) instead of code imports. The import-edge rail above cannot see them
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
	{ consumer: 'ui', schema: 'issue', note: 'BFF read models — GetHomeDashboard reads issues/stops for the operating-status rollup.' },
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
		note: 'TestIngressController seeds a connected channel — CODM_E2E-gated hermetic seam, never mounted in production.',
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
export const POLICY_EXCEPTIONS: readonly { file: string; imports: string; why: string }[] = [
	// GOAL-agent-abstraction Fase 6, AC-6.11(e) — the LADDER, descended in order and stopped at the
	// first rung that passed:
	//   degrau 1 (compose from a BOOTSTRAP_FILE) — NOT APPLICABLE. The scan is not a composition root:
	//     it is a pure read of each controller class's own `static mcpScopes`, and moving it into
	//     `routers.ts` would put a security-relevant scan inside a file whose job is wiring, where no
	//     reviewer looks for it — and would put a barrel import cycle between `routers.ts` and the
	//     agents that need their `--allowedTools` before any HTTP exists.
	//   degrau 2 (declared edge + NAMED per-file exception) — TAKEN. Four edges in CONTEXT_MAP plus the
	//     six entries below, per-file and liveness-gated. Preferred over widening
	//     CROSS_CONTEXT_POLICY.allowed with 'controllers', which would license EVERY context to import
	//     any other's controllers — an architecture decision for the whole repo, made to solve one file.
	//   degrau 3 (integration event) — NOT NEEDED, and under the generated-tools amendment almost
	//     certainly never will be: there is no cross-context TOOL to register any more. The tool IS the
	//     owning context's controller.
	// No cycle is created: `artifact`, `issue`, `ui`, `owner` and `workspace` do not depend on `agent`
	// except for the already-annotated `agent ↔ thread` partnership.
	...(['artifact', 'issue', 'thread', 'ui', 'workspace', 'owner'] as const).map(context => ({
		file: 'agent/mcp/exposure.ts',
		imports: `${context}/controllers`,
		why: NOTE_MCP_EXPOSURE,
	})),
]

/**
 * Cycles that are CONSCIOUS partnerships (DDD Partnership) rather than accidents. Any cycle in
 * CONTEXT_MAP not listed here fails the rail.
 */
export const ANNOTATED_CYCLES: readonly { between: readonly [ContextModule, ContextModule]; why: string }[] = [
	{
		between: ['agent', 'ui'],
		why: "ASYMMETRIC BY NATURE, and only one half is a runtime dependency. ui → agent is real code calling real code: the BFF Settings/AttachWizard queries resolve provider availability through ProviderDetector. agent → ui is the MCP exposure scan READING the `static mcpScopes` of the classes ui's barrel exports — a static-metadata read evaluated once at module load, which constructs nothing and calls nothing. Breaking it would mean either moving the scan into a wiring file where no reviewer looks for it, or dropping the console's own read surface from the scope an external MCP client uses to navigate the system, which is the scope's entire purpose. Recorded rather than hidden: if the scan ever starts INVOKING a ui controller, this annotation stops being true and the edge must be re-argued.",
	},
	{
		between: ['agent', 'thread'],
		why: 'Partnership across the ingest→run seam. BC4 queues a turn into the agent context mailbox in its own ingest transaction, and the agent context consumes BC4 thread/transcript read seams to resolve the run context for the turn it then runs. Two halves of one boundary; the mailbox row carries the runtime hand-off, the read seams only resolve context. (Before the orchestrator pivot the same edge existed for classify→run, with integration.message.classified as the carrier.)',
	},
]

/**
 * Composition-root files EXCLUDED from edge checking — they exist to aggregate every context
 * (registries, routers) and are compile-checked against the CONTEXTS spine instead.
 */
export const BOOTSTRAP_FILES: readonly string[] = ['shared/registry.ts', 'shared/index.ts', 'routers.ts', 'index.ts']
