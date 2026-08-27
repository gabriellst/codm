import { injectable } from 'tsyringe-neo'
import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import { LibSqlDatabaseDriver, tryCatchAsync, LibSqlTransaction } from '@codm/core-typescript'
import { threads, transcriptEntries, stops } from '@codm/contracts/db'
import type { ProviderKind, ContactKind, ThreadStatus, BufferSize } from '@codm/contracts-typescript/wire/enums'
import { Thread, ThreadSchema, type MentionGate, type Participant, type Stop, type TranscriptEntry } from '../../entities/Thread'
import { ThreadRepository } from './ThreadRepository'

@injectable()
export class LibSqlThreadRepository extends ThreadRepository {
	constructor(private driver: LibSqlDatabaseDriver) {
		super()
	}

	async findById(id: string, tx?: LibSqlTransaction): Promise<Thread | undefined> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(threads).where(eq(threads.id, id)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async findByChannelContact(channelId: string, contactExternalId: string, tx?: LibSqlTransaction): Promise<Thread | undefined> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc
				.select()
				.from(threads)
				.where(and(eq(threads.channelId, channelId), eq(threads.contactExternalId, contactExternalId)))
				.limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async listByOwner(ownerId: string, tx?: LibSqlTransaction): Promise<Thread[]> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => dbc.select().from(threads).where(eq(threads.ownerId, ownerId)))
		if (!result.success || !result.data) return []
		return result.data.map(row => this.toDomain(row))
	}

	/**
	 * The thread row plus every entry and stop the aggregate accumulated, on the SAME `dbc` (B4,
	 * decisions 1 and 4).
	 *
	 * Order matters: the thread row first, then its children — so a reader that sees an entry always
	 * sees the thread it hangs off. Ids come from `recordEntry` / `raiseStop`, never from here, which is
	 * the whole difference from the `DrizzleTranscriptRepository.append()` this replaces (it minted with
	 * `crypto.randomUUID()` inside the insert, so no aggregate could reference the row it was creating).
	 */
	async save(entity: Thread, tx?: LibSqlTransaction): Promise<Thread> {
		entity.incrementVersion()
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			await dbc
				.insert(threads)
				.values(data)
				.onConflictDoUpdate({
					target: threads.id,
					set: {
						providers: data.providers,
						paused: data.paused,
						mentionGateEnabled: data.mentionGateEnabled,
						mentionGateTag: data.mentionGateTag,
						// `configureThinkingIndicator` flips this both ways — omitting it from the update set
						// would make turning the placeholder back ON (after turning it off) a write the console
						// reports as saved and the next turn never sees, same class of bug the fields around it
						// already guard against.
						thinkingIndicatorEnabled: data.thinkingIndicatorEnabled,
						// Both flip both ways under the same argument as `thinkingIndicatorEnabled` right above:
						// omitting either from the update set would make turning it back ON a write the console
						// reports as saved and the next turn/delivery never sees.
						reactionsEnabled: data.reactionsEnabled,
						streamingEnabled: data.streamingEnabled,
						// Both directions, like `customPrompt` below: `configureLanguage` declares a language AND
						// hands it back to the owner's default (`undefined` → NULL). An erase missing from the update
						// set is the worse half — the console would show "follow the account" while every turn kept
						// speaking the language nobody can see chosen any more.
						language: data.language,
						participants: data.participants,
						bufferSize: data.bufferSize,
						// Both directions too, and for the same reason the custom prompt is: `configureModel`
						// writes a choice AND erases it (`DEFAULT` deletes the key), and `revive` narrows the map
						// to the providers just re-chosen. Missing from the update set, every one of those is a
						// write the console reports as saved and the dispatcher never sees.
						modelByProvider: data.modelByProvider,
						// Both directions, like `deletedAt` above: `configurePrompt` writes text AND erases it, and
						// an erase that never reaches the UPDATE set is the worst kind of no-op — the console shows
						// an empty box, the agent keeps obeying the instruction nobody can see any more.
						customPrompt: data.customPrompt,
						status: data.status,
						// Load-bearing for BOTH directions of the soft delete: `delete()` stamps it and
						// `revive()` clears it, and neither reaches the database if this column is missing from
						// the update set — the row already exists, so `save` is always the UPDATE branch here.
						deletedAt: data.deletedAt,
						// The contact's own fields travel too, because `revive()` re-applies the wizard's new
						// settings on the SAME row (thread-deletion spec, decision 4). Without them a re-attach
						// would silently keep the workspace and display name of the conversation that was deleted.
						contactDisplayName: data.contactDisplayName,
						contactKind: data.contactKind,
						workspaceId: data.workspaceId,
						updatedAt: new Date(),
						version: data.version,
					},
				})

			// `stops_` aliases the drain so it does not shadow the Drizzle table symbol `stops`.
			const { entries, stops: stops_, stopResolutions } = entity.pullPendingWrites()
			if (entries.length > 0) {
				await dbc.insert(transcriptEntries).values(entries.map(entry => this.entryToPersistence(entry)))
			}
			if (stops_.length > 0) {
				await dbc.insert(stops).values(stops_.map(stop => this.stopToPersistence(stop)))
			}
			// The resolution is an UPDATE of a row that already committed — the caller loaded it with
			// `findStop`, so it exists. One statement per resolution: a single resolve per request is the
			// only shape the product has, and a CASE-based bulk update would be machinery for nobody.
			for (const patch of stopResolutions) {
				await dbc.update(stops).set({ resolution: patch.resolution, resolvedAt: patch.resolvedAt }).where(eq(stops.id, patch.stopId))
			}
			return entity
		})
		if (!result.success) throw result.error
		return result.data
	}

	async delete(id: string, tx?: LibSqlTransaction): Promise<void> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			await dbc.delete(threads).where(eq(threads.id, id))
		})
		if (!result.success) throw result.error
	}

	// ── Child reads ───────────────────────────────────────────────────────────────────────────────

	async recentEntries(threadId: string, limit: number, tx?: LibSqlTransaction): Promise<TranscriptEntry[]> {
		const dbc = tx ?? this.driver.db
		// DESC + limit is the only way to take the LAST N; `.reverse()` hands them back chronological,
		// which is the order the agent's context window must read them in.
		const rows = await dbc
			.select()
			.from(transcriptEntries)
			.where(eq(transcriptEntries.threadId, threadId))
			.orderBy(desc(transcriptEntries.at))
			.limit(limit)
		return rows.map(row => this.toEntry(row)).reverse()
	}

	async listEntries(threadId: string, tx?: LibSqlTransaction): Promise<TranscriptEntry[]> {
		const dbc = tx ?? this.driver.db
		const rows = await dbc
			.select()
			.from(transcriptEntries)
			.where(eq(transcriptEntries.threadId, threadId))
			.orderBy(asc(transcriptEntries.at))
		return rows.map(row => this.toEntry(row))
	}

	async findEntry(entryId: string, tx?: LibSqlTransaction): Promise<TranscriptEntry | undefined> {
		const dbc = tx ?? this.driver.db
		const rows = await dbc.select().from(transcriptEntries).where(eq(transcriptEntries.id, entryId)).limit(1)
		return rows[0] ? this.toEntry(rows[0]) : undefined
	}

	async findStop(stopId: string, tx?: LibSqlTransaction): Promise<Stop | undefined> {
		const dbc = tx ?? this.driver.db
		const rows = await dbc.select().from(stops).where(eq(stops.id, stopId)).limit(1)
		return rows[0] ? this.toStop(rows[0]) : undefined
	}

	async openStops(threadId: string, tx?: LibSqlTransaction): Promise<Stop[]> {
		const dbc = tx ?? this.driver.db
		const rows = await dbc
			.select()
			.from(stops)
			.where(and(eq(stops.threadId, threadId), isNull(stops.resolvedAt)))
		return rows.map(row => this.toStop(row))
	}

	async openStopsByIssue(issueId: string, tx?: LibSqlTransaction): Promise<Stop[]> {
		const dbc = tx ?? this.driver.db
		const rows = await dbc
			.select()
			.from(stops)
			.where(and(eq(stops.issueId, issueId), isNull(stops.resolvedAt)))
		return rows.map(row => this.toStop(row))
	}

	// ── Mapping ───────────────────────────────────────────────────────────────────────────────────

	private toDomain(row: typeof threads.$inferSelect): Thread {
		const mentionGate: MentionGate = row.mentionGateEnabled ? { enabled: true, tag: row.mentionGateTag ?? '' } : { enabled: false }
		const parsed = ThreadSchema.parse({
			ownerId: row.ownerId,
			channelId: row.channelId,
			contactRef: { externalId: row.contactExternalId, displayName: row.contactDisplayName, kind: row.contactKind as ContactKind },
			workspaceId: row.workspaceId,
			providers: row.providers as ProviderKind[],
			paused: row.paused,
			mentionGate,
			thinkingIndicatorEnabled: row.thinkingIndicatorEnabled,
			reactionsEnabled: row.reactionsEnabled,
			streamingEnabled: row.streamingEnabled,
			// The column is nullable and the field is optional — one spelling of "never chosen" on each
			// side, collapsed here, exactly as `customPrompt` below does.
			language: row.language ?? undefined,
			participants: row.participants as Participant[],
			bufferSize: row.bufferSize as BufferSize,
			modelByProvider: row.modelByProvider,
			customPrompt: row.customPrompt ?? undefined,
			status: row.status as ThreadStatus,
			deletedAt: row.deletedAt ?? undefined,
		})
		return new Thread({ ...parsed, id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt, version: row.version })
	}

	private toPersistence(entity: Thread): typeof threads.$inferInsert {
		return {
			id: entity.id.value,
			ownerId: entity.ownerId,
			channelId: entity.channelId,
			contactExternalId: entity.contactRef.externalId,
			contactDisplayName: entity.contactRef.displayName,
			contactKind: entity.contactRef.kind,
			workspaceId: entity.workspaceId,
			providers: entity.providers,
			paused: entity.paused,
			mentionGateEnabled: entity.mentionGate.enabled,
			mentionGateTag: entity.mentionGate.enabled ? entity.mentionGate.tag : null,
			thinkingIndicatorEnabled: entity.thinkingIndicatorEnabled,
			reactionsEnabled: entity.reactionsEnabled,
			streamingEnabled: entity.streamingEnabled,
			language: entity.language ?? null,
			participants: entity.participants,
			bufferSize: entity.bufferSize,
			modelByProvider: entity.modelByProvider,
			customPrompt: entity.customPrompt ?? null,
			status: entity.status,
			deletedAt: entity.deletedAt ?? null,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			version: entity.version,
		}
	}

	private entryToPersistence(entry: TranscriptEntry): typeof transcriptEntries.$inferInsert {
		return {
			id: entry.entryId,
			ownerId: entry.ownerId,
			threadId: entry.threadId,
			kind: entry.kind,
			text: entry.text,
			issueId: entry.issueId ?? null,
			quotedEntryId: entry.quotedEntryId ?? null,
			senderExternalId: entry.senderExternalId ?? null,
			firedByLoop: entry.firedByLoop ?? null,
			provider: entry.provider ?? null,
			classification: entry.classification ?? null,
			messageType: entry.messageType ?? null,
			mediaPath: entry.mediaPath ?? null,
			artifactId: entry.artifactId ?? null,
			at: entry.at,
		}
	}

	/**
	 * NO casts, deliberately — `DrizzleTranscriptRepository.toRow` had four and every one was a no-op.
	 * `thread_transcript_entries` declares `kind`, `provider` and `classification` with `$type<…>()`
	 * (`schema/thread.ts`), so the row is already narrowed and `as TranscriptKind` only hid that
	 * fact — and hid it in the one place a real mismatch would matter.
	 */
	private stopToPersistence(stop: Stop): typeof stops.$inferInsert {
		return {
			id: stop.stopId,
			ownerId: stop.ownerId,
			issueId: stop.issueId ?? null,
			threadId: stop.threadId,
			kind: stop.kind,
			title: stop.title,
			detail: stop.detail,
			raisedAt: stop.raisedAt,
			resolution: stop.resolution ?? null,
			resolvedAt: stop.resolvedAt ?? null,
		}
	}

	// No casts, same reason as `toEntry`: `issue_stops.kind` and `.resolution` carry `$type<…>()`.
	private toStop(row: typeof stops.$inferSelect): Stop {
		return {
			stopId: row.id,
			ownerId: row.ownerId,
			issueId: row.issueId ?? undefined,
			threadId: row.threadId,
			kind: row.kind,
			title: row.title,
			detail: row.detail,
			raisedAt: row.raisedAt,
			resolution: row.resolution ?? undefined,
			resolvedAt: row.resolvedAt ?? undefined,
		}
	}

	private toEntry(row: typeof transcriptEntries.$inferSelect): TranscriptEntry {
		return {
			entryId: row.id,
			ownerId: row.ownerId,
			threadId: row.threadId,
			kind: row.kind,
			text: row.text,
			issueId: row.issueId ?? undefined,
			quotedEntryId: row.quotedEntryId ?? undefined,
			senderExternalId: row.senderExternalId ?? undefined,
			firedByLoop: row.firedByLoop ?? undefined,
			provider: row.provider ?? undefined,
			classification: row.classification ?? undefined,
			messageType: row.messageType ?? undefined,
			mediaPath: row.mediaPath ?? undefined,
			artifactId: row.artifactId ?? undefined,
			at: row.at,
		}
	}
}
