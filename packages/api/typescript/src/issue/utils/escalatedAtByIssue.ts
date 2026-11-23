import { and, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm'
import { z, type LibSqlDatabaseDriver } from '@codm/core-typescript'
import { events, stops } from '@codm/contracts/db'
import { SupervisorVerdict } from '@codm/contracts-typescript/wire/enums'
import { FactSource } from '@agent/enums'

/** The supervisor's fact (written by `agent`; read here by name, like every fact the timeline reads). */
const SUPERVISOR_REVIEWED = 'agent.supervisor.reviewed'

/** A stop the task raised ITSELF — the reconciler's stall is `INFERRED` and does not count as the task speaking. */
const DeclaredStopSchema = z.object({ source: z.literal(FactSource.DECLARED) })

/**
 * WHAT CLEARS AN ESCALATION (fase 5, item 3) — the facts that say the task moved on its own after the supervisor
 * escalated it, each with what makes it a DECLARATION: a completion; something the task said (feedback, progress); a
 * stop the task itself raised. A stop resolved after the escalation clears it too (read from `issue_stops`).
 */
const ESCALATION_CLEARED_BY: Readonly<Record<string, (payload: unknown) => boolean>> = {
	'agent.run.completed': () => true,
	'agent.issue_spoke': () => true,
	'agent.run.stop_raised': payload => DeclaredStopSchema.safeParse(payload).success,
}

/**
 * Per issue, the instant the supervisor last ESCALATED it (an ACTED `ESCALATE`, `agent.supervisor.reviewed`) — the
 * badge on the card, console and panel. Nobody is messaged for it (owner, 20/11): the badge and the timeline are the
 * whole escalation. Cleared once the task moved after it: a stop of the issue resolved later, or a declaration fact
 * later (`ESCALATION_CLEARED_BY`). Read-side only.
 *
 * `issueIds` narrows the read for a single-issue view; absent reads every escalated issue (the overview).
 */
export async function escalatedAtByIssue(driver: LibSqlDatabaseDriver, issueIds?: readonly string[]): Promise<Map<string, Date>> {
	const db = driver.db
	const escalated = await db
		.select({ issueId: events.entityId, at: sql<number>`max(${events.occurredAt})` })
		.from(events)
		.where(
			and(
				eq(events.name, SUPERVISOR_REVIEWED),
				sql`json_extract(${events.payload}, '$.acted') = 1`,
				sql`json_extract(${events.payload}, '$.verdict') = ${SupervisorVerdict.ESCALATE}`,
				issueIds ? inArray(events.entityId, [...issueIds]) : undefined,
			),
		)
		.groupBy(events.entityId)
	const last = new Map(escalated.flatMap(row => (row.issueId ? [[row.issueId, new Date(Number(row.at))] as const] : [])))
	if (last.size === 0) return last
	const ids = [...last.keys()]
	const earliest = new Date(Math.min(...[...last.values()].map(at => at.getTime())))

	const [resolved, declared] = await Promise.all([
		db
			.select({ issueId: stops.issueId, at: stops.resolvedAt })
			.from(stops)
			.where(and(inArray(stops.issueId, ids), isNotNull(stops.resolvedAt), gt(stops.resolvedAt, earliest))),
		db
			.select({ issueId: events.entityId, name: events.name, at: events.occurredAt, payload: events.payload })
			.from(events)
			.where(and(inArray(events.entityId, ids), inArray(events.name, Object.keys(ESCALATION_CLEARED_BY)), gt(events.occurredAt, earliest))),
	])
	const moved = (issueId: string, at: Date | null) => {
		const since = last.get(issueId)
		if (since && at && at > since) last.delete(issueId)
	}
	for (const row of resolved) if (row.issueId) moved(row.issueId, row.at)
	for (const row of declared) {
		if (row.issueId && ESCALATION_CLEARED_BY[row.name]?.(row.payload)) moved(row.issueId, row.at)
	}
	return last
}
