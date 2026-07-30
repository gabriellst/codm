import { injectable } from 'tsyringe-neo'
import { and, eq, isNull } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@codedm/core-typescript'
import { threads, stops, issues } from '@codedm/contracts/db'
import { IssueStatus, ThreadStatus } from '@codedm/contracts-typescript/wire/enums'
import { ThreadStatusDeriver } from './ThreadStatusDeriver'

@injectable()
export class DrizzleThreadStatusDeriver extends ThreadStatusDeriver {
	constructor(private db: DrizzleClient) {
		super()
	}

	async forThread(threadId: string): Promise<ThreadStatus> {
		const result = await tryCatchAsync(async () => {
			const [threadRow] = await this.db.select({ paused: threads.paused }).from(threads).where(eq(threads.id, threadId)).limit(1)
			if (!threadRow) return undefined
			// `limit(1)` on both: the question is EXISTENCE, and a thread with forty open stops must not
			// pay for thirty-nine rows nobody reads.
			const openStop = await this.db
				.select({ id: stops.id })
				.from(stops)
				.where(and(eq(stops.threadId, threadId), isNull(stops.resolvedAt)))
				.limit(1)
			const working = await this.db
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
			const threadRows = await this.db.select({ id: threads.id, paused: threads.paused }).from(threads).where(eq(threads.ownerId, ownerId))
			const openStops = await this.db
				.select({ threadId: stops.threadId })
				.from(stops)
				.where(and(eq(stops.ownerId, ownerId), isNull(stops.resolvedAt)))
			const workingIssues = await this.db
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
