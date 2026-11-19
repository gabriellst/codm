import { injectable } from 'tsyringe-neo'
import { and, asc, eq, gte, inArray, isNotNull, min, sql } from 'drizzle-orm'
import { LibSqlDatabaseDriver, z } from '@codm/core-typescript'
import { events } from '@codm/contracts/db'
import { AgentModelId, ProviderKind, UsageRole } from '@codm/contracts-typescript/wire/enums'
import { AgentProviderLimitEvent, AgentProviderLimitEventSchema } from '../../events/AgentProviderLimitEvent'
import { AgentQuotaHeldEvent, AgentQuotaHeldEventSchema, AgentQuotaReleasedEvent } from '../../events/AgentQuotaHeldEvent'
import { AgentRunStartedEvent } from '../../events/AgentRunStartedEvent'
import { AgentUsageEvent, AgentUsageEventSchema } from '../../events/AgentUsageEvent'
import { costOf, weightsFor } from '../../utils/UsageCost'
import type { QuotaHoldFact, QuotaLedger, QuotaLimitFact, QuotaRunStart, QuotaUsageFact } from './QuotaLedger'
import { QuotaLedgerReader } from './QuotaLedgerReader'

/** A usage fact the budget can price: role, provider and model present (every fase-4 producer stamps all three). */
const PricedUsageSchema = AgentUsageEventSchema.shape.payload.extend({
	role: z.enum(UsageRole),
	provider: z.enum(ProviderKind),
	model: z.enum(AgentModelId),
})
const LimitPayloadSchema = AgentProviderLimitEventSchema.shape.payload
const HoldPayloadSchema = AgentQuotaHeldEventSchema.shape.payload

/** The fact names the ledger is made of — and so the only rows this reader asks the index for. */
const LEDGER_FACTS = [
	AgentUsageEvent.name,
	AgentProviderLimitEvent.name,
	AgentRunStartedEvent.name,
	AgentQuotaHeldEvent.name,
	AgentQuotaReleasedEvent.name,
] as const

/** Reads the ledger from `shared_events` — the same store every producer wrote the facts to. */
@injectable()
export class LibSqlQuotaLedgerReader extends QuotaLedgerReader {
	constructor(private readonly driver: LibSqlDatabaseDriver) {
		super()
	}

	async read(since: Date): Promise<QuotaLedger> {
		const db = this.driver.db
		const [rows, [first]] = await Promise.all([
			db
				.select({ name: events.name, entityId: events.entityId, payload: events.payload, occurredAt: events.occurredAt })
				.from(events)
				.where(and(inArray(events.name, [...LEDGER_FACTS]), gte(events.occurredAt, since)))
				.orderBy(asc(events.occurredAt), asc(events.id)),
			db
				.select({ at: min(events.occurredAt) })
				.from(events)
				.where(and(eq(events.name, AgentUsageEvent.name), isNotNull(sql`json_extract(${events.payload}, '$.role')`))),
		])

		const usage: QuotaUsageFact[] = []
		const limits: QuotaLimitFact[] = []
		const issueRunStarts: QuotaRunStart[] = []
		const holds: QuotaHoldFact[] = []
		for (const row of rows) {
			const at = row.occurredAt.getTime()
			const entityId = row.entityId ?? ''
			if (row.name === AgentUsageEvent.name) {
				const parsed = PricedUsageSchema.safeParse(row.payload)
				if (!parsed.success) continue
				const fact = parsed.data
				usage.push({
					at,
					entityId,
					role: fact.role,
					cost: costOf(fact, weightsFor(fact.provider, fact.model)),
					windows: (fact.windows ?? []).map(boundary => ({ window: boundary.window, resetsAt: Date.parse(boundary.resetsAt) })),
				})
			} else if (row.name === AgentProviderLimitEvent.name) {
				const parsed = LimitPayloadSchema.safeParse(row.payload)
				if (!parsed.success) continue
				limits.push({
					at,
					window: parsed.data.window,
					status: parsed.data.status,
					...(parsed.data.resetsAt && { resetsAt: Date.parse(parsed.data.resetsAt) }),
				})
			} else if (row.name === AgentRunStartedEvent.name) {
				issueRunStarts.push({ at, entityId })
			} else {
				const parsed = HoldPayloadSchema.safeParse(row.payload)
				if (!parsed.success) continue
				holds.push({ at, window: parsed.data.window, holding: row.name === AgentQuotaHeldEvent.name, enforced: parsed.data.enforced })
			}
		}
		const firstRoleFactAt = first?.at ? new Date(first.at).getTime() : undefined
		return { usage, limits, holds, issueRunStarts, ...(firstRoleFactAt !== undefined && { firstRoleFactAt }) }
	}
}
