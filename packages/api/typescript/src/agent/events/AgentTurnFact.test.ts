import { describe, expect, it } from 'bun:test'
import { BaseDomainEvent } from '@codedm/core-typescript'
import { AgentMessageRole, AgentToolCallStatus } from '../enums'
import { AgentMessageEvent, AgentToolCallEvent, AgentUsageEvent, type AgentTurnFact } from './index'

/**
 * AC-1.7 — every `AgentTurnFact` variant is a real `BaseDomainEvent`, not a POJO.
 *
 * Why this is worth a test rather than a code review note: these facts go to the OUTBOX, and the
 * outbox round-trips payloads through JSON. `EventHandler` rehydrates each row back into its declared
 * CLASS precisely so `instanceof` keeps working on the far side — a fix that exists only in this fork
 * (§6.4) and without which the whole domain→integration bridge is dead in real mode. A POJO here
 * would compile, pass a shape assertion, and then silently never reach a handler.
 */

const startedAt = new Date('2026-07-27T10:00:00.000Z').toISOString()

const facts = (): AgentTurnFact[] => [
	new AgentMessageEvent({
		ownerId: '00000000-0000-4000-8000-000000000001',
		payload: { messageId: 'msg_01', role: AgentMessageRole.ASSISTANT, text: 'done' },
	}),
	new AgentToolCallEvent({
		ownerId: '00000000-0000-4000-8000-000000000001',
		payload: {
			toolUseId: 'toolu_01',
			tool: 'Edit',
			input: { file_path: 'src/a.ts' },
			status: AgentToolCallStatus.COMPLETED,
			startedAt,
			finishedAt: new Date('2026-07-27T10:00:02.000Z').toISOString(),
		},
	}),
	new AgentUsageEvent({
		ownerId: '00000000-0000-4000-8000-000000000001',
		payload: { inputTokens: 1200, outputTokens: 340, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
	}),
]

describe('AC-1.7 — AgentTurnFact is a union of BaseDomainEvent subclasses', () => {
	it.each(facts())('%p is an instanceof BaseDomainEvent', fact => {
		expect(fact).toBeInstanceOf(BaseDomainEvent)
	})

	it('each variant is instanceof its own class — the union discriminates by class, not by a tag field', () => {
		const [message, toolCall, usage] = facts()
		expect(message).toBeInstanceOf(AgentMessageEvent)
		expect(toolCall).toBeInstanceOf(AgentToolCallEvent)
		expect(usage).toBeInstanceOf(AgentUsageEvent)
		expect(message).not.toBeInstanceOf(AgentToolCallEvent)
	})

	it('carries a stable event name per variant, in the context-private namespace', () => {
		// Never `integration.*`: these are context-private observations. The outbox routes by that
		// prefix, so claiming it here would silently publish a private fact across the service boundary.
		for (const Cls of [AgentMessageEvent, AgentToolCallEvent, AgentUsageEvent]) {
			expect(Cls.name.startsWith('integration.')).toBe(false)
		}
		expect(AgentMessageEvent.name).toBe('agent.turn.message')
		expect(AgentToolCallEvent.name).toBe('agent.turn.tool_call')
		expect(AgentUsageEvent.name).toBe('agent.turn.usage')
	})
})

describe('the tool-call fact carries a WHOLE lifecycle', () => {
	it('accepts the orphan case as FAILED with no finishedAt — the flush() materialization', () => {
		const orphan = new AgentToolCallEvent({
			payload: {
				toolUseId: 'toolu_orphan',
				tool: 'Bash',
				input: { command: 'pnpm build' },
				status: AgentToolCallStatus.FAILED,
				startedAt,
				errorMessage: 'turn ended before tool_result arrived',
			},
		})
		expect(orphan).toBeInstanceOf(BaseDomainEvent)
		expect(AgentToolCallEvent.schema.shape.payload.safeParse(orphan.payload).success).toBe(true)
	})

	it('keeps `tool` an OPEN set (z.string) — MCP adds tools at runtime', () => {
		const parsed = AgentToolCallEvent.schema.shape.payload.safeParse({
			toolUseId: 'toolu_02',
			tool: 'codedm__complete_issue',
			input: {},
			status: AgentToolCallStatus.COMPLETED,
			startedAt,
		})
		expect(parsed.success).toBe(true)
	})

	it('rejects a status outside the closed terminal set', () => {
		const parsed = AgentToolCallEvent.schema.shape.payload.safeParse({
			toolUseId: 'toolu_03',
			tool: 'Read',
			input: {},
			status: 'RUNNING',
			startedAt,
		})
		expect(parsed.success).toBe(false)
	})
})

describe('the usage fact is token counts, not money', () => {
	const zeroed = { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 }

	it('rejects negative or fractional token counts', () => {
		expect(AgentUsageEvent.schema.shape.payload.safeParse({ ...zeroed, inputTokens: -1 }).success).toBe(false)
		expect(AgentUsageEvent.schema.shape.payload.safeParse({ ...zeroed, inputTokens: 1.5 }).success).toBe(false)
		expect(AgentUsageEvent.schema.shape.payload.safeParse(zeroed).success).toBe(true)
	})

	it('rejects negative or fractional CACHE token counts too — same rule, all four buckets', () => {
		expect(
			AgentUsageEvent.schema.shape.payload.safeParse({ ...zeroed, cacheCreationInputTokens: -1 }).success,
		).toBe(false)
		expect(AgentUsageEvent.schema.shape.payload.safeParse({ ...zeroed, cacheReadInputTokens: 1.5 }).success).toBe(
			false,
		)
	})

	it('has no cost/currency field — pricing is policy applied by the reader, not a fact of the run', () => {
		const keys = Object.keys(AgentUsageEvent.schema.shape.payload.shape)
		expect(keys).toEqual(['inputTokens', 'outputTokens', 'cacheCreationInputTokens', 'cacheReadInputTokens'])
		// Stated as intent as well as as a key list, so a future additive field cannot smuggle money in
		// by merely updating the list above.
		expect(keys.some(k => /cost|price|usd|currency|money/i.test(k))).toBe(false)
	})

	/**
	 * REGRESSION, anchored on measured bytes — GOAL §4.3 / Fase-2 smoke divergence D4.
	 *
	 * These four numbers are read off `phase2-smoke/raw/s1-text.jsonl`, a real turn. The point of the
	 * test is the ratio, not the values: the plain `inputTokens` bucket carries 2 of the ~24.5k input
	 * tokens actually consumed. The frozen two-field version of this event would have recorded 2 and
	 * under-billed the turn by ~1000x, which is why the cache buckets are REQUIRED rather than
	 * optional — an optional bucket silently reintroduces exactly this loss whenever it is omitted.
	 */
	it('records the whole input, not just the uncached sliver (real numbers from the smoke)', () => {
		const measured = {
			inputTokens: 2,
			outputTokens: 10,
			cacheCreationInputTokens: 9188,
			cacheReadInputTokens: 15273,
		}
		const parsed = AgentUsageEvent.schema.shape.payload.safeParse(measured)
		expect(parsed.success).toBe(true)

		const totalInput = measured.inputTokens + measured.cacheCreationInputTokens + measured.cacheReadInputTokens
		expect(totalInput).toBe(24463)
		// The whole reason the two-field contract was a correctness bug, asserted rather than narrated.
		expect(measured.inputTokens / totalInput).toBeLessThan(0.001)
	})

	it('requires the cache buckets — a payload missing them does not parse', () => {
		// A non-caching provider must pass explicit 0s (arithmetically correct: with no cache, all
		// input lands in `inputTokens`). Silence is not an accepted way to say zero.
		expect(AgentUsageEvent.schema.shape.payload.safeParse({ inputTokens: 5, outputTokens: 5 }).success).toBe(false)
	})
})
