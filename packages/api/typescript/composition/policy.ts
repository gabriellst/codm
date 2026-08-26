import type { ContextId } from '@codm/contracts/context-ids'

/**
 * A POLÍTICA de fronteira entre contextos — o que é DECIDIDO, e só isso.
 *
 * ── o que saiu daqui na DC2, e por quê ───────────────────────────────────────────────────────────
 * Este arquivo se chamava `context-map.ts` e carregava quatro coisas: o MAPA de quem depende de
 * quem (`CONTEXT_MAP`), as leituras de tabela cross-namespace (`TABLE_READ_EDGES`), os fornecedores
 * ambientais (`AMBIENT`) e a política abaixo. As três primeiras eram DECLARAÇÕES DE CONTEXTO
 * escritas numa lista central: para acrescentar uma dependência ao `agent`, você editava um arquivo
 * que fala de todos os dez.
 *
 * Elas agora moram no `context.ts` de cada contexto — `consumes`, `reads`, `ambient` — e o agregado
 * é gerado em `contexts.generated.ts`. O que sobrou aqui é o que NÃO pertence a contexto nenhum: a
 * política que vale para todos, as exceções nomeadas a ela, os ciclos anotados e os arquivos de
 * bootstrap. Nenhuma dessas quatro é derivável de nada — são decisões do repo sobre si mesmo.
 *
 * INTENÇÃO PRECEDE DERIVAÇÃO, e continua valendo: nada aqui é observado dos imports reais. O rail é
 * que confronta o declarado contra o observado, e é isso que dá sentido ao confronto.
 */

/**
 * Why the MCP exposure scan imports another context's controllers — written once and cited by both the
 * declared edges and the named policy exceptions below, so the two can never drift apart.
 */
const NOTE_MCP_EXPOSURE =
	"The MCP exposure scan (agent/mcp/exposure.ts) imports each context's `controllers/index.ts` BARREL in order to READ each class's `static mcpScopes` — discovery, not declaration. Nothing is constructed, nothing is invoked, no state crosses; the association scope↔controller lives on the controller itself, which is the founder amendment this replaced the manifest with. The barrel is the whole set because WIRE-03 already requires every Controller subclass to be exported from it. It is confined to ONE file so a prompt builder never has to import another context's barrel to name a tool. The runtime path is the opposite of an import: tool → HTTP → that context's own controller → its own use case."
export const CROSS_CONTEXT_POLICY = {
	allowed: ['repositories', 'services', 'objects', 'enums', 'schemas', 'middlewares', 'i18n'],
	forbidden: ['entities', 'usecases', 'handlers', 'events', 'controllers', 'jobs', 'projections'],
} as const
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
	// No cycle is created: `artifact`, `issue`, `ui` and `workspace` do not depend on `agent`
	// except for the already-annotated `agent ↔ thread` partnership.
	//
	// `owner` SAIU desta lista em 2026-08-14 (ADR 0001, W3 Task 4c): ele passou a ser cloud-only, e a
	// porta MCP vive em `agent`, que só monta em `local`. A varredura deixou de importar
	// `@owner/controllers` — manter a exceção aqui a tornaria FÓSSIL, que é exatamente o que o teste
	// `context-map` acusa (e acusou: foi ele que pegou esta ponta).
	...(['artifact', 'issue', 'thread', 'ui', 'workspace'] as const).map(context => ({
		file: 'agent/mcp/exposure.ts',
		imports: `${context}/controllers`,
		why: NOTE_MCP_EXPOSURE,
	})),
	{
		file: 'agent/usecases/SteerIssueTurn.ts',
		imports: 'issue/usecases',
		why:
			'The redirect-to-a-completed-issue ladder, descended in order and stopped at the first rung that passed:\n' +
			"  degrau 1 (refactor to repositories/services) — NOT TAKEN, deliberately. The rail's default advice assumes " +
			'the importer is a PEER context; `agent` is not one, it IS the orchestration layer over the other contexts. ' +
			"Moving the reopen into `agent` as a raw `IssueRepository` load/mutate/save would scatter `Issue`'s own " +
			'lifecycle invariant (the `reopen()` transition and the `ISSUE_NOT_COMPLETED` guard it enforces) outside the ' +
			'context that owns it — the exact write-model leak the `forbidden` list exists to catch, just reached from ' +
			'the repositories surface instead of the entities one.\n' +
			'  degrau 2 (declared edge + NAMED per-file exception) — TAKEN. `agent → issue` is already a declared ' +
			'CONTEXT_MAP edge (agent/mcp/exposure.ts reads issue/controllers); this exception extends the SAME edge to ' +
			"the usecases surface, for this one file. Composing the destination context's OWN use case is orchestration " +
			"expressed directly: `Issue.reopen()` stays reachable only through `issue`'s own guarded entrypoint " +
			'(`ReopenIssue`), and the permission is per-file and liveness-gated, so it cannot outlive this one import.\n' +
			'  degrau 3 (integration event) — NOT NEEDED. The steer must reopen the issue and enqueue the STEER mailbox ' +
			'item in ONE transaction (`Handler.withTransaction`, shared with `ReopenIssue` via the `tx` it accepts) — an ' +
			'event would make the reopen eventual, letting a STEER reach an issue that is still COMPLETED.',
	},
	{
		file: 'agent/services/MailboxDispatcher/LibSqlMailboxDispatcher.ts',
		imports: 'thread/usecases',
		why:
			'A poisoned mailbox item has to become a Needs-you card. The ladder, descended in order:\n' +
			'  degrau 1 (refactor to repositories/services) — NOT TAKEN. Raising a Stop is not a write the ' +
			'`ThreadRepository` can express: `RaiseStop` checks `StopPolicyConfig` (a disabled criterion must be a ' +
			'no-op, not a card), is idempotent on `stopId`, resolves the title through the thread owner`s language, ' +
			'and since the channel-notice work also enqueues the delivery command in the same transaction. Reaching for ' +
			'the aggregate directly from here would duplicate every one of those and drift from them the first time one ' +
			'changes.\n' +
			'  degrau 2 (declared edge + NAMED per-file exception) — TAKEN. `agent → thread` is already the most ' +
			'trafficked declared edge in the map (this very file imports `@thread/repositories`); this extends the SAME ' +
			'edge to the usecases surface for one file, and `agent` is the orchestration layer rather than a peer — ' +
			'composing the destination context`s own guarded entrypoint is its job. Per-file and liveness-gated.\n' +
			'  degrau 3 (integration event) — NOT NEEDED, and worse here. The dispatcher is the ONLY place that knows an ' +
			'item just died; publishing a fact for someone else to react to would put a second hop between the failure ' +
			'and the card, on the exact path whose failure mode is already "nobody was told". Measured 2026-08-04: an ' +
			'issue sat WORKING for two and a half hours with three dead items and no signal anywhere.',
	},
	...(
		[
			{ file: 'ui/usecases/CompleteOnboarding.ts', imports: 'workspace/usecases' },
			{ file: 'ui/usecases/CompleteOnboarding.ts', imports: 'thread/usecases' },
			{ file: 'ui/schemas/OnboardingDraftState.ts', imports: 'workspace/usecases' },
			{ file: 'ui/schemas/OnboardingDraftState.ts', imports: 'thread/usecases' },
		] as const
	).map(({ file, imports }) => ({
		file,
		imports,
		why:
			"The onboarding atomic-commit ladder (spec 2026-08-26), descended in order and stopped at the first rung that passed:\n" +
			'  degrau 1 (refactor to repositories/services) — NOT TAKEN. `CompleteOnboarding` must materialize the ' +
			"wizard's draft into REAL aggregates — a new `Workspace` (or reuse of an existing one) and a `Thread` bound " +
			'to it — inside ONE transaction with `onboarding.complete()`. `AddWorkspace`/`AttachThread` each own real ' +
			"orchestration (path/git detection + dedupe, channel-connectivity + provider-detection + drivable-set " +
			"guards, roster seeding, domain-event persistence) that `ui` has no business re-deriving via raw " +
			"repository writes — that IS the write-model leak the `forbidden` list exists to catch, just reached from " +
			"the entities/services surface instead of usecases.\n" +
			"  degrau 2 (declared edge + NAMED per-file exception) — TAKEN. `ui → workspace` and `ui → thread` are " +
			"declared CONTEXT_MAP edges (`ui/context.ts` `consumes`); this extends each to the usecases surface, " +
			"per-file. Composing the destination context's OWN guarded entrypoint (`AddWorkspace`/`AttachThread`) is " +
			"orchestration expressed directly — the same shape `SteerIssueTurn`'s `issue/usecases` exception already " +
			"licenses for `agent`. `OnboardingDraftState` schemas are COMPOSED (`.shape.contactRef`, `.shape.path`) " +
			"from these same use cases' Input schemas rather than redigitated, so the exception on the schema file is " +
			"the wire-contract half of the same decision.\n" +
			"  degrau 3 (integration event) — NOT NEEDED, and wrong here. The commit must be ATOMIC: if `AttachThread` " +
			"fails after `AddWorkspace` succeeded, the whole transaction — including `onboarding.complete()` — must " +
			"roll back together (spec AC: 'falha revalidação → nada persiste'). An event would make each step " +
			"eventual and reintroduce exactly the partial-write-on-reboot bug this feature exists to close.",
	})),
]

/**
 * Cycles that are CONSCIOUS partnerships (DDD Partnership) rather than accidents. Any cycle in
 * CONTEXT_MAP not listed here fails the rail.
 */
export const ANNOTATED_CYCLES: readonly { between: readonly [ContextId, ContextId]; why: string }[] = [
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
export const BOOTSTRAP_FILES: readonly string[] = ['shared/registry.ts', 'composition.generated.ts', 'openapi.ts', 'index.ts']
