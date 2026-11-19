import { describe, expect, it } from 'bun:test'
import { AgentModelId, IssueWorkKind, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { offersModel } from '@catalog'
import { ModelChoiceKind } from '../enums/ModelChoiceKind'
import { MODEL_BY_WORK_KIND, issueTurnModel, modelForWork } from './ModelByWorkKind'

/**
 * THE TABLE OF MODELS BY KIND OF WORK (fase 4, S7) — the gate the docblock promises, and what each lookup answers.
 *
 * Falsifier: put a tier the provider does not serve in the table (codex `SONNET`) and the gate names it.
 */
describe('MODEL_BY_WORK_KIND', () => {
	it('every MODEL choice is one its provider offers — never a guaranteed 400', () => {
		const unserved = Object.values(ProviderKind).flatMap(provider =>
			Object.values(IssueWorkKind).flatMap(workKind => {
				const choice = MODEL_BY_WORK_KIND[provider][workKind]
				return choice.kind === ModelChoiceKind.MODEL && !offersModel(provider, choice.model) ? [`${provider}.${workKind}`] : []
			}),
		)
		expect(unserved).toEqual([])
	})

	it("a change keeps the conversation's model on every provider — only what does not write may run cheaper", () => {
		for (const provider of Object.values(ProviderKind)) {
			expect(MODEL_BY_WORK_KIND[provider][IssueWorkKind.CHANGE]).toEqual({ kind: ModelChoiceKind.CONVERSATION })
		}
	})

	it("modelForWork: a claude diagnosis runs on SONNET whatever the conversation says; a change takes the conversation's", () => {
		expect(modelForWork(ProviderKind.CLAUDE_CODE, IssueWorkKind.DIAGNOSIS, AgentModelId.OPUS)).toBe(AgentModelId.SONNET)
		expect(modelForWork(ProviderKind.CLAUDE_CODE, IssueWorkKind.CHANGE, AgentModelId.OPUS)).toBe(AgentModelId.OPUS)
		expect(modelForWork(ProviderKind.CODEX, IssueWorkKind.DIAGNOSIS, AgentModelId.TERRA)).toBe(AgentModelId.TERRA)
	})

	it("issueTurnModel: the recorded model wins; none recorded (born before S7), or one the provider does not serve, takes the conversation's", () => {
		expect(issueTurnModel(ProviderKind.CLAUDE_CODE, AgentModelId.SONNET, AgentModelId.OPUS)).toBe(AgentModelId.SONNET)
		expect(issueTurnModel(ProviderKind.CLAUDE_CODE, undefined, AgentModelId.OPUS)).toBe(AgentModelId.OPUS)
		expect(issueTurnModel(ProviderKind.CODEX, AgentModelId.SONNET, AgentModelId.LUNA)).toBe(AgentModelId.LUNA)
	})
})
