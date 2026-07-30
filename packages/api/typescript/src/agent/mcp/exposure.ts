import { McpExposure, operationIdOf, type McpExposedControllerClass } from '@codedm/core-typescript'
import { McpScope } from '@codedm/contracts-typescript/wire/enums'
import * as artifactControllers from '@artifact/controllers'
import * as issueControllers from '@issue/controllers'
import * as threadControllers from '@thread/controllers'
import * as uiControllers from '@ui/controllers'
import * as workspaceControllers from '@workspace/controllers'
import * as ownerControllers from '@owner/controllers'
import { CreateIssueController } from '../controllers/CreateIssue'
import { TransitionIssueStatusController } from '../controllers/TransitionIssueStatus'
import { RaiseStopController } from '../controllers/RaiseStop'
import { AskOperatorController } from '../controllers/AskOperator'
import { ForkIssueController } from '../controllers/ForkIssue'
import { SteerIssueTurnController } from '../controllers/SteerIssueTurn'
import { RecordArtifactController } from '@artifact/controllers'
import { wireToolName } from './wire'

/**
 * THE RUNTIME HALF OF THE EXPOSURE SCAN (B2, spec decision 2 — the Open Question this plan closes).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * IT IMPORTS BARRELS TO DISCOVER, WHERE THE MANIFEST IMPORTED CLASSES TO DECLARE
 * Its predecessor, `mcp/manifest.ts`, held `MCP_SCOPES = { 'issue-handling': [A, B, C, …] }` — the
 * scope↔controller association LIVED there, and a controller joining a scope was an edit to that
 * list. This file holds no list: it asks every exported controller class what its own
 * `static mcpScopes` says. A controller that joins a scope tomorrow is scanned tomorrow, with no edit
 * here, and one that leaves simply stops appearing.
 *
 * WHY A SCAN OF BARRELS AND NOT A SCAN OF `router.controllers`
 * The emitter already walks resolved instances and does exactly that (`McpExposure.fromRouters`). The
 * RUNTIME cannot: an agent needs its `--allowedTools` while assembling a spawn, in a module that
 * cannot reach `src/routers.ts` without a cycle (`routers.ts → agent/index.ts → agent/registry.ts`).
 * Injecting the exposure through DI was measured against the wrong wall too —
 * `tests/architecture/real-di-resolution.test.ts` resolves both agents from a child container built
 * from `ALL_REGISTRIES.real` alone, with no composition root anywhere, and a binding that needed
 * `Router[]` would make that rail red on the spot.
 *
 * THE SCAN HAS NO BLIND SPOT, AND THAT IS ENFORCED ELSEWHERE
 * `tests/architecture/wiring-completeness.test.ts` (WIRE-03) already requires every class extending
 * `Controller` to be exported from its context's `controllers/index.ts`. A controller outside its
 * barrel is a red build for an older reason than this file, so "the barrel is the whole set" is a
 * property somebody else is already guarding.
 *
 * THE CROSS-CONTEXT IMPORTS ARE CONFINED TO THIS FILE, exactly as they were confined to the manifest,
 * and `shared/context-map.ts` names the six per-file exceptions. What changed is the JUSTIFICATION:
 * they used to be here so one screen could DECLARE the audience; they are here now so one module can
 * DISCOVER it without dragging a barrel import into a prompt builder.
 *
 * ### As três superfícies e por que são três
 * The prose below is the manifest's, moved rather than lost — the scope lists it annotated are gone,
 * but WHY each surface has the shape it has is still the thing a reviewer needs.
 *
 *  - `issue-handling` — what an agent uses WHILE EXECUTING AN ISSUE. Six operations, and the list is
 *    deliberately short: everything there is a write the agent is expected to perform on its own
 *    behalf, on its own issue. `IssueWorkAgent` declares this scope and nothing else.
 *  - `orchestration` — WHAT THE ORCHESTRATOR MAY DO WHILE TALKING (§7.2): fork an issue, and look at
 *    this thread's own. Deliberately NOT the six writes of `issue-handling`: that agent converses and
 *    decides, it never does issue work (§3, "o orquestrador nunca executa trabalho de issue").
 *    Steering is the one exception and it is not issue WORK — it is telling a worker something, which
 *    is conversation pointed at a subagent. Every entry is thread-shaped: `ForkIssue` and
 *    `GetSessionIssues` take `threadId` (which the identity confines), and `GetIssueStatus` takes
 *    both, checking ownership itself.
 *  - `system` — NAVIGATION AND OPERATION of the system. Generated and mounted, but NO internal agent
 *    declares it in this phase — its consumer is an external MCP client (the operator's own agent,
 *    browsing the system). Handing `system` to `IssueWorkAgent` would put `owner/*` and `workspace/*`
 *    within reach of a model driven by an inbound WhatsApp message, which is precisely the property
 *    the allowlist exists to preserve.
 *
 * `ListenEvents` and `StreamTerminalSession` are ABSENT ON PURPOSE (AC-6.14(d)): they are SSE, they
 * were emitted as ordinary tools in the probe baseline, and called as tools they would simply hang
 * the agent until the watchdog. Under the static they are absent by SILENCE — neither class declares
 * anything — which is the same guarantee without a list to keep them off.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * THIS CONTEXT'S OWN controllers, imported BY FILE rather than through `../controllers`.
 *
 * MEASURED, and it is the one place the barrel cannot be used: `agent/controllers/index.ts` exports
 * `TestRunIssueTurnController`, which imports `../usecases/RunIssueTurn`, which imports
 * `IssueWorkAgent`, which imports THIS module — a cycle that dies as
 * `ReferenceError: Cannot access 'AgentRunnerFactory' before initialization` in 63 tests, because
 * `@injectable()` reads `design:paramtypes` while the cycle is still in flight. The predecessor
 * (`mcp/manifest.ts`) imported the six external barrels and this context's controllers BY FILE for
 * exactly this reason; keeping its module graph is what keeps the graph acyclic.
 *
 * The residual gap — an `agent` controller that declares a scope without being listed here — is not
 * silent: the emitter walks resolved INSTANCES and would publish it, so the class-side scan and the
 * spec would disagree and `tests/architecture/mcp-exposure.test.ts` goes red BY NAME. Same posture as
 * the multi-method operationId limitation: a known edge turned into a failing assertion rather than
 * into an empty tool.
 */
const AGENT_CONTROLLER_CLASSES: readonly McpExposedControllerClass[] = [
	CreateIssueController,
	TransitionIssueStatusController,
	RaiseStopController,
	AskOperatorController,
	ForkIssueController,
	SteerIssueTurnController,
]

/** Every exported controller class of every context that has (or may grow) an MCP surface. */
const ALL_CONTROLLER_CLASSES: readonly McpExposedControllerClass[] = [
	artifactControllers,
	issueControllers,
	threadControllers,
	uiControllers,
	workspaceControllers,
	ownerControllers,
]
	.flatMap(barrel => Object.values(barrel).filter((value): value is McpExposedControllerClass => typeof value === 'function'))
	.concat(AGENT_CONTROLLER_CLASSES)

/** The scan, computed once per process. Classes are static; re-walking them per call buys nothing. */
const EXPOSURE = McpExposure.fromClasses(ALL_CONTROLLER_CLASSES)

/** `SCOPE_OPS(s)` — the operationIds a scope exposes, derived and never written down. */
export function operationIdsInScope(scope: McpScope): readonly string[] {
	// `String(scope)` is `local/no-enum-widening`'s own sanctioned opt-out, and here the widening is
	// PERMANENT BY DESIGN rather than a follow-up: `McpExposure` lives in `core`, and core deliberately
	// does not know that this product's surfaces are called `issue-handling` / `orchestration` /
	// `system` — that is the seam the whole B2 design rests on, and the T2 gate greps `core/` for
	// `McpScope` expecting ZERO hits. Exhaustiveness is kept where it belongs: on THIS function's
	// parameter, which every caller must satisfy with a real enum member.
	return EXPOSURE.operationIds(String(scope))
}

/**
 * The expansion an agent declares as its `tools`. NEVER a hand-written list: adding
 * `static mcpScopes` to a controller changes the argv with no edit to a runner, an agent or a test.
 */
export function toolsInScope(scope: McpScope): readonly string[] {
	return operationIdsInScope(scope).map(wireToolName)
}

/** The scan itself, for the golden snapshot to compare against the emitted spec. */
export function mcpExposure(): McpExposure {
	return EXPOSURE
}

/**
 * `WIRE(C)` — the spelling an MCP client calls a controller by. One hop over `operationIdOf`, which
 * is core's single copy of the emitter's own rule.
 */
export function toolNameOf(controller: McpExposedControllerClass): string {
	return wireToolName(operationIdOf(controller))
}

export { operationIdOf, wireToolName }

/**
 * The controller classes NAMED BY PROSE — a prompt that tells a model which tool to call, and the
 * deterministic e2e driver that calls two of them by name.
 *
 * This is NOT the scope list reborn: nothing here says which surface any of them belongs to, and
 * removing an entry removes a SENTENCE, not an exposure. They are re-exported from this file for one
 * mechanical reason — it is the module already licensed to import another context's barrel, and
 * spreading that license to a prompt builder would spread the context-map exceptions with it.
 */
export {
	CreateIssueController,
	TransitionIssueStatusController,
	RaiseStopController,
	AskOperatorController,
	ForkIssueController,
	RecordArtifactController,
}
