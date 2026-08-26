import { injectable } from 'tsyringe-neo'
import { and, eq, isNull } from 'drizzle-orm'
import { LibSqlDatabaseDriver, tryCatchAsync } from '@codm/core-typescript'
import { threads, stops, issues } from '@codm/contracts/db'
import { IssueStatus, ThreadStatus } from '@codm/contracts-typescript/wire/enums'
import { ThreadStatusDeriver } from './ThreadStatusDeriver'

@injectable()
export class LibSqlThreadStatusDeriver extends ThreadStatusDeriver {
	constructor(private driver: LibSqlDatabaseDriver) {
		super()
	}

	async forThread(threadId: string): Promise<ThreadStatus> {
		const result = await tryCatchAsync(async () => {
			// Filtered like every other read (thread-deletion spec, decision 5), and here the filter is what
			// makes the FALLBACK correct rather than merely tidy: no row → `undefined` → the caller gets the
			// IDLE default, which is precisely the neutral badge an apagada conversation should have if a
			// screen somehow still asks. Both of this deriver's callers already refuse a deleted thread
			// outright (`GetSessionChat` throws, `GetHomeDashboard` never lists it), so this is the floor
			// under them, not the gate.
			const [threadRow] = await this.driver.db
				.select({ paused: threads.paused })
				.from(threads)
				.where(and(eq(threads.id, threadId), isNull(threads.deletedAt)))
				.limit(1)
			if (!threadRow) return undefined
			// `limit(1)` on both: the question is EXISTENCE, and a thread with forty open stops must not
			// pay for thirty-nine rows nobody reads.
			const openStop = await this.driver.db
				.select({ id: stops.id })
				.from(stops)
				.where(and(eq(stops.threadId, threadId), isNull(stops.resolvedAt)))
				.limit(1)
			const working = await this.driver.db
				.select({ id: issues.id })
				.from(issues)
				.where(and(eq(issues.threadId, threadId), eq(issues.status, IssueStatus.WORKING), eq(issues.archived, false)))
				.limit(1)
			return this.derive({ paused: threadRow.paused, hasOpenStop: openStop.length > 0, hasWorkingIssue: working.length > 0 })
		})
		// A thread that cannot be read is IDLE rather than a throw: every caller is a READ MODEL feeding a
		// screen, and a status is a badge — the same posture `ChannelConnectivity` takes with `false`.
		return result.success && result.data ? result.data : ThreadStatus.IDLE
	}

	async forOwner(ownerId: string): Promise<Map<string, ThreadStatus>> {
		const result = await tryCatchAsync(async () => {
			// The owner-wide map keys on live threads only: an entry for an apagada conversation is a status
			// nothing can render, and the dashboard that consumes this map has already dropped the row.
			const threadRows = await this.driver.db
				.select({ id: threads.id, paused: threads.paused })
				.from(threads)
				.where(and(eq(threads.ownerId, ownerId), isNull(threads.deletedAt)))
			const openStops = await this.driver.db
				.select({ threadId: stops.threadId })
				.from(stops)
				.where(and(eq(stops.ownerId, ownerId), isNull(stops.resolvedAt)))
			const workingIssues = await this.driver.db
				.select({ threadId: issues.threadId })
				.from(issues)
				.where(and(eq(issues.ownerId, ownerId), eq(issues.status, IssueStatus.WORKING), eq(issues.archived, false)))

			const withStop = new Set(openStops.map(s => s.threadId))
			const withWork = new Set(workingIssues.map(i => i.threadId))
			return new Map(
				threadRows.map(t => [
					t.id,
					this.derive({ paused: t.paused, hasOpenStop: withStop.has(t.id), hasWorkingIssue: withWork.has(t.id) }),
				]),
			)
		})
		return result.success ? result.data : new Map()
	}
}
