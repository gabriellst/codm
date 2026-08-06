import { describe, expect, it } from 'bun:test'
import { ProviderKind, AgentModelId } from '../generated/typescript/src/wire/enums'
import { PROVIDER_MODELS, auditProviderModels, modelsFor, offersModel } from './agent-models'

/**
 * THE GATE for the one redeclaration this catalog cannot avoid.
 *
 * `AgentModelId` is authored in `wire/enums/agent-model-id.tsp` and WHO OWNS EACH MEMBER is authored
 * in `agent-models.ts`. Two files, one fact — which the repo's rule allows only with a rail in front
 * of it. This is the rail: a model added to the enum and assigned to nobody is red here, not silently
 * unreachable in a selector.
 *
 * The negative fixtures run through `auditProviderModels`, the SAME function the positive assertion
 * uses, precisely so this file cannot drift from the thing it guards.
 */
describe('PROVIDER_MODELS — the declared provider → models relation', () => {
	it('assigns every model except DEFAULT to exactly one provider', () => {
		const audit = auditProviderModels(PROVIDER_MODELS)
		expect(audit.unowned).toEqual([])
		expect(audit.shared).toEqual([])
	})

	it('offers DEFAULT wherever anything can be chosen at all', () => {
		expect(auditProviderModels(PROVIDER_MODELS).missingDefault).toEqual([])
	})

	it('lists no model twice', () => {
		expect(auditProviderModels(PROVIDER_MODELS).duplicated).toEqual([])
	})

	it('covers every ProviderKind — the map is exhaustive by type, and stays so at runtime', () => {
		for (const provider of Object.values(ProviderKind)) {
			expect(PROVIDER_MODELS[provider]).toBeArray()
		}
	})

	it('offers a real catalog for the one CLI this engine drives, and nothing for the others', () => {
		expect(modelsFor(ProviderKind.CLAUDE_CODE)).toContain(AgentModelId.OPUS)
		// Empty ⇒ nothing to choose. Deliberately NOT `[DEFAULT]`: a select with one option is noise.
		expect(modelsFor(ProviderKind.CODEX)).toEqual([])
		expect(modelsFor(ProviderKind.OPENCODE)).toEqual([])
	})

	it('answers membership by lookup', () => {
		expect(offersModel(ProviderKind.CLAUDE_CODE, AgentModelId.HAIKU)).toBe(true)
		expect(offersModel(ProviderKind.CODEX, AgentModelId.HAIKU)).toBe(false)
	})

	describe('the gate itself fails on the drift it exists for', () => {
		it('catches a model no provider claims', () => {
			const orphaned = {
				[ProviderKind.CLAUDE_CODE]: [AgentModelId.DEFAULT, AgentModelId.OPUS],
				[ProviderKind.CODEX]: [],
				[ProviderKind.OPENCODE]: [],
			}
			expect(auditProviderModels(orphaned).unowned).toContain(AgentModelId.SONNET)
		})

		it('catches a model claimed by two providers', () => {
			const shared = {
				[ProviderKind.CLAUDE_CODE]: [AgentModelId.DEFAULT, AgentModelId.OPUS, AgentModelId.SONNET, AgentModelId.HAIKU],
				[ProviderKind.CODEX]: [AgentModelId.DEFAULT, AgentModelId.OPUS],
				[ProviderKind.OPENCODE]: [],
			}
			expect(auditProviderModels(shared).shared).toEqual([AgentModelId.OPUS])
		})

		it('catches a choosable provider with no way back to DEFAULT', () => {
			const noDefault = {
				[ProviderKind.CLAUDE_CODE]: [AgentModelId.OPUS, AgentModelId.SONNET, AgentModelId.HAIKU],
				[ProviderKind.CODEX]: [],
				[ProviderKind.OPENCODE]: [],
			}
			expect(auditProviderModels(noDefault).missingDefault).toEqual([ProviderKind.CLAUDE_CODE])
		})

		it('catches a repeated entry', () => {
			const repeated = {
				[ProviderKind.CLAUDE_CODE]: [AgentModelId.DEFAULT, AgentModelId.OPUS, AgentModelId.OPUS, AgentModelId.SONNET, AgentModelId.HAIKU],
				[ProviderKind.CODEX]: [],
				[ProviderKind.OPENCODE]: [],
			}
			expect(auditProviderModels(repeated).duplicated).toEqual([ProviderKind.CLAUDE_CODE])
		})
	})
})
