import type { Controller } from '@codedm/core-typescript'
import { RecordArtifactController, ListArtifactsController } from '@artifact/controllers'
import {
	GetIssueDetailController,
	GetIssuesOverviewController,
	GetNeedsYouPanelController,
	GetSessionIssuesController,
} from '@issue/controllers'
import {
	SendDirectMessageController,
	GetThreadSettingsController,
	GetSessionChatController,
	ConfigureContextBufferController,
	ConfigureMentionGateController,
} from '@thread/controllers'
import {
	GetHomeDashboardController,
	GetMyAccountController,
	GetSettingsController,
	GetSetupChecklistController,
	GetUserInfoController,
	GetAttachThreadWizardController,
} from '@ui/controllers'
import { ListWorkspacesController, AddWorkspaceController, RemoveWorkspaceController } from '@workspace/controllers'
import {
	CreateOwnerController,
	SetActiveOwnerController,
	UpdateOwnerSettingsController,
	EnableOwnerController,
	DisableOwnerController,
} from '@owner/controllers'
import { wireToolName } from './wire'
import { CreateIssueController } from '../controllers/CreateIssue'
import { TransitionIssueStatusController } from '../controllers/TransitionIssueStatus'
import { RaiseStopController } from '../controllers/RaiseStop'
import { AskOperatorController } from '../controllers/AskOperator'

/**
 * THE MANIFEST — the single declaration of which HTTP operations are reachable as MCP tools, and
 * under which scope (GOAL-agent-abstraction Fase 6, founder design amendment; AC-6.14/AC-6.15).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY IT IS A MANIFEST AND NOT A FLAG ON THE CONTROLLER (founder decision)
 * A controller is an HTTP door. WHO consumes it is not its business, and scattering `mcpScope =` over
 * 40 controllers would make the security-relevant question — "what exactly can a model call?" —
 * un-answerable without reading 40 files. Here it is one screen, reviewable in one diff.
 *
 * WHY IT REFERENCES CLASSES AND NOT `operationId` STRINGS (founder decision, and it BITES)
 * A rename FOLLOWS (the class is the identifier, so `tsc` rewrites it with the symbol) and a deletion
 * BREAKS THE BUILD instead of silently shrinking the tool surface to a list of dead strings. AC-6.15(b)
 * executes exactly that: rename a controller, watch `tsc` go red here, then watch the operationId, the
 * synthetic tag and the emitted tool name all follow with no second edit.
 *
 * THE DEFAULT IS NOT EXPOSED, AND THAT IS NOT FREE
 * Measured on the real spec: with no `include` filter, `@kubb/plugin-mcp` turned ALL 40 operations
 * into tools. The security property comes ENTIRELY from the explicit allowlist derived from this
 * file. A controller born tomorrow is not a tool tomorrow, because nobody put it here. That is the
 * whole scheme: every endpoint that ships is otherwise within reach of a model reading WhatsApp
 * messages written by strangers.
 *
 * THE THREE LAYERS, AND WHY THREE (measured, not aesthetic)
 *  1. THIS FILE — the declaration, typed.
 *  2. `x-mcp-scope` on the operation in the emitted spec — the declaration of record: human-readable,
 *     greppable, survives into `openapi.json`. Written by the same emitter seam that already writes
 *     `x-error-codes`.
 *  3. A SYNTHETIC TAG `mcp:<scope>` — the transport. `@kubb/plugin-oas` filters by
 *     `tag | operationId | path | method | contentType` and by NOTHING else: there is no branch that
 *     reads a vendor extension and none that calls a predicate, and an unknown filter `type` falls to
 *     `default: return false` SILENTLY. An `include: [{ type: 'x-mcp-scope', … }]` emitted zero tools
 *     with a green build. The tag is not a preference — it is the only axis the filter can see.
 *
 * PACKAGE BOUNDARY: `packages/contracts` cannot import from `api/src` (its deps are drizzle-orm +
 * yaml), so the manifest lives in the api package and the crossing to Kubb (in `packages/client`)
 * happens through the EMITTED SPEC. There is no third copy of this list anywhere.
 */

/** The two audiences. They cut ACROSS the per-bounded-context tags, which is why a second axis exists at all. */
export const MCP_SCOPE_NAMES = ['issue-handling', 'system'] as const
export type McpScope = (typeof MCP_SCOPE_NAMES)[number]

/**
 * Structural type of a controller class.
 *
 * It constrains the INSTANCE shape (`path` + `description` are what makes something an HTTP door)
 * rather than naming `Controller<In, Out>` directly. That is not laziness: `Controller` is generic
 * over its two Zod schemas and its `input` position is contravariant, so `Controller<never, never>`
 * is assignable FROM nothing — every real controller fails it (TS2419, measured). Pinning the
 * generics per entry would mean restating each controller's schema pair here, which is the second
 * source of truth this manifest exists to avoid.
 *
 * The typing still BITES exactly where the founder asked it to (AC-6.15): deleting a controller
 * breaks the import, renaming one follows the symbol, and a class that is not an HTTP door is not
 * assignable.
 */
type ControllerClass = abstract new (...args: never[]) => Pick<Controller<never, never>, 'path' | 'description'>

export const MCP_SCOPES = {
	/**
	 * What an agent uses WHILE EXECUTING AN ISSUE. Six operations, and the list is deliberately short:
	 * everything here is a write the agent is expected to perform on its own behalf, on its own issue.
	 * `IssueWorkAgent` declares this scope and nothing else.
	 */
	'issue-handling': [
		CreateIssueController,
		TransitionIssueStatusController,
		RaiseStopController,
		AskOperatorController,
		SendDirectMessageController,
		RecordArtifactController,
	],
	/**
	 * NAVIGATION AND OPERATION of the system. Generated and mounted, but NO internal agent declares it
	 * in this phase — its consumer is an external MCP client (the operator's own agent, browsing the
	 * system). Handing `system` to `IssueWorkAgent` would put `owner/*` and `workspace/*` within reach
	 * of a model driven by an inbound WhatsApp message, which is precisely the property the allowlist
	 * exists to preserve.
	 *
	 * `ListenEvents` and `StreamTerminalSession` are ABSENT ON PURPOSE (AC-6.14(d)): they are SSE, they
	 * were emitted as ordinary tools in the probe baseline, and called as tools they would simply hang
	 * the agent until the watchdog.
	 */
	system: [
		// ui/* reads
		GetHomeDashboardController,
		GetMyAccountController,
		GetSettingsController,
		GetSetupChecklistController,
		GetUserInfoController,
		GetAttachThreadWizardController,
		// workspace/*
		ListWorkspacesController,
		AddWorkspaceController,
		RemoveWorkspaceController,
		// thread configuration
		GetThreadSettingsController,
		GetSessionChatController,
		ConfigureContextBufferController,
		ConfigureMentionGateController,
		// issue reads
		GetIssueDetailController,
		GetIssuesOverviewController,
		GetNeedsYouPanelController,
		GetSessionIssuesController,
		ListArtifactsController,
		// owner/*
		CreateOwnerController,
		SetActiveOwnerController,
		UpdateOwnerSettingsController,
		EnableOwnerController,
		DisableOwnerController,
	],
} as const satisfies Record<McpScope, readonly ControllerClass[]>

/**
 * `OP(C)` — the operationId of a controller class, by THE EMITTER'S OWN RULE.
 *
 * This is not a second convention that happens to agree: it is a copy of the one line in
 * `core/src/utils/OpenAPI.ts#buildOperationId`, and AC-6.15(c) asserts set-equality between what this
 * derives and what actually carries `x-mcp-scope` in the emitted `openapi.json` — in both directions,
 * so a drift in either file is a red test rather than a silently empty tool.
 *
 * It is also EXACTLY the name `@kubb/plugin-mcp` registers the tool under: `serverGenerator` does
 * `name: operation.getOperationId()` and never routes it through `resolveName` or `transformers`
 * (proven: with a `transformers.name` the FILES were renamed and `server.registerTool("RecordArtifact", …)`
 * was not). Tool names are therefore not ours to choose, which is why the four frozen Fase-1
 * spellings from Fase 1 are gone (AC-6.17).
 *
 * The multi-method suffix the emitter appends is deliberately NOT reproduced: no controller in either
 * scope declares more than one method, and a silent divergence is better caught by the set-equality
 * test than papered over by a second guess at the rule.
 */
export function operationIdOf(controller: ControllerClass): string {
	return controller.name.replace('Controller', '')
}

/** `SCOPE_OPS(s)` — the operationIds of a scope, read from the manifest and nowhere else. */
export function scopeOperationIds(scope: McpScope): readonly string[] {
	return MCP_SCOPES[scope].map(operationIdOf)
}

/** `WIRE(C)` — re-exported from the leaf module that owns the spelling, never rebuilt here. */
export { wireToolName }

/**
 * The expansion an agent declares as its `tools` (§4.3 rule 7). NEVER a hand-written list: AC-6.5's
 * falsifier adds a seventh entry above and requires the runner's argv to change with no edit to the
 * runner or the test.
 */
export function toolsInScope(scope: McpScope): readonly string[] {
	return scopeOperationIds(scope).map(wireToolName)
}

/** Convenience for the two agents + the argv test — same derivation, spelled once. */
export const TOOLS_IN_SCOPE = Object.fromEntries(MCP_SCOPE_NAMES.map(s => [s, toolsInScope(s)])) as Record<McpScope, readonly string[]>

/**
 * The reverse index the OpenAPI emitter consults: `operationId → scopes`. Built here rather than in
 * the emitter so that the emitter never learns a second rule for deriving an operationId.
 */
export const MCP_SCOPE_BY_OPERATION: ReadonlyMap<string, readonly McpScope[]> = (() => {
	const index = new Map<string, McpScope[]>()
	for (const scope of MCP_SCOPE_NAMES) {
		for (const operationId of scopeOperationIds(scope)) {
			const existing = index.get(operationId)
			if (existing) existing.push(scope)
			else index.set(operationId, [scope])
		}
	}
	return index
})()
