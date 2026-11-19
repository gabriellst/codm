import { AgentModelId, IssueWorkKind, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { offersModel } from '@catalog'
import { ModelChoiceKind } from '../enums/ModelChoiceKind'

/**
 * What the table says a kind of work runs on (fase 4, item 6d) — a discriminated union, never a sentinel string:
 *  - `CONVERSATION` — the model the conversation is set to (`Thread.modelFor`), read when the task is forked;
 *  - `MODEL` — this model, whatever the conversation says.
 */
export type ModelChoice = { kind: ModelChoiceKind.CONVERSATION } | { kind: ModelChoiceKind.MODEL; model: AgentModelId }

const CONVERSATION: ModelChoice = { kind: ModelChoiceKind.CONVERSATION }

/**
 * WHICH MODEL EACH KIND OF WORK RUNS ON, PER PROVIDER (fase 4, item 6d) — a declared relation in the shape of
 * `PROVIDER_SMALL_MODEL`, never an `if (provider === …)` at a call site: the fork reads `modelForWork` and is done.
 * Per provider because `DEFAULT` and the tiers differ by CLI.
 *
 * - `CHANGE` (writes, publishes) keeps the conversation's model — the choice the operator made for the work.
 * - `DIAGNOSIS` (reads and reports — no edit, no publish) runs on a cheaper tier. Claude: `SONNET` (the spec's
 *   choice; `HAIKU` is the triage's tier, too small for an investigation). Codex and opencode keep the conversation's
 *   until there is a measured cheaper tier for an investigation (`LUNA` is codex's triage tier, the same call as
 *   `HAIKU`; opencode offers no model at all).
 *
 * Exhaustive by type (`Record`), so a new provider or a new kind of work makes `tsc` ask for its entry; gated by
 * `ModelByWorkKind.test.ts`: every `MODEL` choice is one its provider offers — a tier it does not serve would be a
 * guaranteed 400 on every turn of the task.
 */
export const MODEL_BY_WORK_KIND: Readonly<Record<ProviderKind, Readonly<Record<IssueWorkKind, ModelChoice>>>> = {
	[ProviderKind.CLAUDE_CODE]: {
		[IssueWorkKind.CHANGE]: CONVERSATION,
		[IssueWorkKind.DIAGNOSIS]: { kind: ModelChoiceKind.MODEL, model: AgentModelId.SONNET },
	},
	[ProviderKind.CODEX]: {
		[IssueWorkKind.CHANGE]: CONVERSATION,
		[IssueWorkKind.DIAGNOSIS]: CONVERSATION,
	},
	[ProviderKind.OPENCODE]: {
		[IssueWorkKind.CHANGE]: CONVERSATION,
		[IssueWorkKind.DIAGNOSIS]: CONVERSATION,
	},
}

/** The model a task of `workKind` is born with on `provider` — the table's, or the conversation's when it says so. */
export function modelForWork(provider: ProviderKind, workKind: IssueWorkKind, conversationModel: AgentModelId): AgentModelId {
	const choice = MODEL_BY_WORK_KIND[provider][workKind]
	return choice.kind === ModelChoiceKind.MODEL ? choice.model : conversationModel
}

/**
 * The model a turn of a task runs on: the one it was born with — fixed for its life, so a resume never meets
 * `MODEL_CHANGED` — or the conversation's for a task born before fase 4 (no model recorded). A recorded model the
 * turn's provider does not offer (the conversation changed its CLI since the fork) cannot run there, so the turn
 * takes the conversation's for that provider: a 400 on every turn would be worse than a fresh session.
 */
export function issueTurnModel(provider: ProviderKind, recorded: AgentModelId | undefined, conversationModel: AgentModelId): AgentModelId {
	return recorded !== undefined && offersModel(provider, recorded) ? recorded : conversationModel
}
