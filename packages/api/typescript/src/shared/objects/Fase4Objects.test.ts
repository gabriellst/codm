import { describe, expect, it } from 'bun:test'
import {
	AskEffect,
	BatchItemDestinationKind,
	BatchStatus,
	PublishFollowUpKind,
	QuotaState,
	SlotLimit,
} from '@codm/contracts-typescript/wire/enums'
import { BatchItemDestinationSchema, BatchSchema } from './Batch'
import { PublishCommandSchema, PublishFollowUpSchema } from './PublishCommand'
import { PanelHealthSchema, QuotaSnapshotSchema } from './QuotaSnapshot'
import { StopAskSchema } from './StopAsk'

const ISSUE = '00000000-0000-4000-8000-0000000000b1'

describe('fase 4 wire objects', () => {
	it('a publish command is an argument list: at least the executable, no empty argument', () => {
		expect(PublishCommandSchema.safeParse({ argv: ['bun', 'run', 'deploy'] }).success).toBe(true)
		expect(PublishCommandSchema.safeParse({ argv: [] }).success).toBe(false)
		expect(PublishCommandSchema.safeParse({ argv: ['bun', ''] }).success).toBe(false)
		// A shell line is just one (odd) executable name — nothing parses it.
		expect(PublishCommandSchema.parse({ argv: ['deploy; rm -rf /'] }).argv).toEqual(['deploy; rm -rf /'])
	})

	it('a batch destination carries only its own kind’s fields', () => {
		expect(BatchItemDestinationSchema.safeParse({ kind: BatchItemDestinationKind.NEW_ISSUE, issueId: ISSUE }).success).toBe(true)
		expect(BatchItemDestinationSchema.safeParse({ kind: BatchItemDestinationKind.NEW_ISSUE }).success).toBe(false)
		expect(BatchItemDestinationSchema.safeParse({ kind: BatchItemDestinationKind.DECLINED, reason: 'fora do escopo' }).success).toBe(true)
		expect(BatchItemDestinationSchema.safeParse({ kind: BatchItemDestinationKind.NEEDS_DECISION, issueId: ISSUE }).success).toBe(false)
		const batch = BatchSchema.parse({
			code: 'L-31',
			status: BatchStatus.INCOMPLETE,
			sourceEntryId: ISSUE,
			items: [{ n: 1, excerpt: 'item', destination: { kind: BatchItemDestinationKind.ATTACHED, issueId: ISSUE } }],
		})
		expect(batch.items).toHaveLength(1)
	})

	it('an ask may declare what an option authorizes and what follows a successful publish', () => {
		const ask = StopAskSchema.parse({
			question: 'Posso publicar?',
			options: [
				{ id: 'yes', label: 'Sim', authorizes: [AskEffect.PUBLISH] },
				{ id: 'no', label: 'Não' },
			],
			effects: [AskEffect.PUBLISH],
			onPublished: { kind: PublishFollowUpKind.COMPLETE, summary: 'Publicado.' },
		})
		expect(ask.options[0]?.authorizes).toEqual([AskEffect.PUBLISH])
		expect(PublishFollowUpSchema.safeParse({ kind: PublishFollowUpKind.COMPLETE }).success).toBe(false)
	})

	it('the panel health has no absolute figure of the account; the console snapshot does', () => {
		const panelKeys = Object.keys(PanelHealthSchema.shape)
		expect(panelKeys).not.toContain('window')
		expect(panelKeys).not.toContain('week')
		expect(
			QuotaSnapshotSchema.safeParse({
				state: QuotaState.OK,
				window: { spent: 1, ceiling: 10, reserve: 0.5 },
				week: { spent: 2, ceiling: 100 },
				slots: { inUse: 1, max: 6, effective: 4, limitedBy: SlotLimit.MACHINE },
				queue: { pending: 0, heldByBudget: 0 },
				diskFreeBytes: 1024,
				budget: { enforced: false, admits: true },
			}).success,
		).toBe(true)
	})
})
