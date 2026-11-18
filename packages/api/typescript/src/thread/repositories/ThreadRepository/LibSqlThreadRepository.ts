import { injectable } from 'tsyringe-neo'
import { and, asc, desc, eq, inArray, isNull, lte, max, or } from 'drizzle-orm'
import { BaseError, LibSqlDatabaseDriver, tryCatchAsync, LibSqlTransaction } from '@codm/core-typescript'
import { threads, transcriptEntries, stops } from '@codm/contracts/db'
import {
	OutputRouting,
	StopKind,
	type ProviderKind,
	type ContactKind,
	type ThreadStatus,
	type BufferSize,
} from '@codm/contracts-typescript/wire/enums'
import { StopAnswerSchema, StopAskSchema } from '@shared/objects'
import { Thread, ThreadSchema, type MentionGate, type Participant, type Stop, type TranscriptEntry } from '../../entities/Thread'
import { askDueAt } from '../../objects/StopAsk'
import type { DomainErrors } from '../../errors'
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
						// `configureOutputMode` flips it every way — missing here, a mode change would be a write the
						// console reports as saved and the output policy never sees.
						outputMode: data.outputMode,
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
			const { entries, stops: stops_, stopResolutions, entryLinks, digestPatches } = entity.pullPendingWrites()
			if (entries.length > 0) {
				await dbc.insert(transcriptEntries).values(entries.map(entry => this.entryToPersistence(entry)))
			}
			if (stops_.length > 0) {
				await dbc.insert(stops).values(stops_.map(stop => this.stopToPersistence(stop)))
			}
			// The resolution is an UPDATE of a row that already committed — the caller loaded it with
			// `findStop`, so it exists. One statement per resolution: a single resolve per request is the
			// only shape the product has, and a CASE-based bulk update would be machinery for nobody.
			//
			// CONDITIONAL (fase 3): only a stop still OPEN is stamped. Two resolvers that both loaded the stop
			// open — a quoted reply and the panel, an answer and the deadline job — both pass the aggregate's
			// own `resolvedAt` check; this is where the second one learns it lost. Zero rows ⇒
			// STOP_ALREADY_RESOLVED, which rolls the caller's whole transaction back, so nothing the loser
			// recorded beside it (an entry, an echo, a steer) survives.
			for (const patch of stopResolutions) {
				const stamped = await dbc
					.update(stops)
					.set({
						resolution: patch.resolution,
						resolvedAt: patch.resolvedAt,
						answer: patch.answer ?? null,
						answeredBy: patch.answeredBy ?? null,
					})
					.where(and(eq(stops.id, patch.stopId), isNull(stops.resolvedAt)))
					.returning({ id: stops.id })
				if (stamped.length === 0) {
					throw new BaseError<DomainErrors>('STOP_ALREADY_RESOLVED', `stop ${patch.stopId} was resolved by someone else first`)
				}
			}
			// A late routing (`Thread.linkEntryToIssue`) — the entry committed earlier, unrouted. `issue_id IS NULL`
			// re-asserted in the UPDATE, so a link can never overwrite one decided at ingest.
			for (const link of entryLinks) {
				await dbc
					.update(transcriptEntries)
					.set({ issueId: link.issueId, classification: link.classification })
					.where(and(eq(transcriptEntries.id, link.entryId), isNull(transcriptEntries.issueId)))
			}
			// The per-person digest (fase 3) — CONDITIONAL on the entry still waiting, the same shape as the stop
			// resolution above: zero rows ⇒ another flush already sent it, and the whole transaction rolls back.
			for (const patch of digestPatches) {
				const flushed = await dbc
					.update(transcriptEntries)
					.set({ routing: patch.routing, digestEntryId: patch.digestEntryId ?? null })
					.where(
						and(
							eq(transcriptEntries.id, patch.entryId),
							eq(transcriptEntries.routing, OutputRouting.DIGEST),
							isNull(transcriptEntries.digestEntryId),
						),
					)
					.returning({ id: transcriptEntries.id })
				if (flushed.length === 0) {
					throw new BaseError<DomainErrors>('SIGNAL_ALREADY_FLUSHED', `entry ${patch.entryId} was flushed by someone else first`)
				}
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

	// ── The asks (fase 3) ──────────────────────────────────────────────────────────────────────────

	async nextAskSeq(issueId: string, tx?: LibSqlTransaction): Promise<number> {
		const dbc = tx ?? this.driver.db
		const [row] = await dbc
			.select({ last: max(stops.seq) })
			.from(stops)
			.where(eq(stops.issueId, issueId))
		return (row?.last ?? 0) + 1
	}

	async markAskDelivered(entryId: string, deliveredAt: Date, tx?: LibSqlTransaction): Promise<string[]> {
		const dbc = tx ?? this.driver.db
		// The asks a DIGEST entry carried: each question kept its own entry, pointing at the digest that took it.
		const carried = dbc.select({ id: transcriptEntries.id }).from(transcriptEntries).where(eq(transcriptEntries.digestEntryId, entryId))
		const marked = await dbc
			.update(stops)
			.set({ dueAt: askDueAt(deliveredAt) })
			.where(
				and(
					eq(stops.kind, StopKind.QUESTION_ASKED),
					isNull(stops.resolvedAt),
					isNull(stops.dueAt),
					or(eq(stops.askEntryId, entryId), inArray(stops.askEntryId, carried)),
				),
			)
			.returning({ id: stops.id })
		return marked.map(row => row.id)
	}

	async findDueAsks(now: Date, tx?: LibSqlTransaction): Promise<Stop[]> {
		const dbc = tx ?? this.driver.db
		const rows = await dbc
			.select()
			.from(stops)
			.where(and(eq(stops.kind, StopKind.QUESTION_ASKED), isNull(stops.resolvedAt), lte(stops.dueAt, now)))
			.orderBy(asc(stops.dueAt))
		return rows.map(row => this.toStop(row))
	}

	async findAsk(issueId: string, seq: number, tx?: LibSqlTransaction): Promise<Stop | undefined> {
		const dbc = tx ?? this.driver.db
		const rows = await dbc
			.select()
			.from(stops)
			.where(and(eq(stops.issueId, issueId), eq(stops.seq, seq)))
			.limit(1)
		return rows[0] ? this.toStop(rows[0]) : undefined
	}

	async pendingDigest(threadId: string, addresseeId: string | undefined, tx?: LibSqlTransaction): Promise<TranscriptEntry[]> {
		const dbc = tx ?? this.driver.db
		const rows = await dbc
			.select()
			.from(transcriptEntries)
			.where(
				and(
					eq(transcriptEntries.threadId, threadId),
					eq(transcriptEntries.routing, OutputRouting.DIGEST),
					isNull(transcriptEntries.digestEntryId),
					addresseeId === undefined ? isNull(transcriptEntries.addresseeId) : eq(transcriptEntries.addresseeId, addresseeId),
				),
			)
			.orderBy(asc(transcriptEntries.at))
		return rows.map(row => this.toEntry(row))
	}

	async stopsCarriedBy(entryId: string, tx?: LibSqlTransaction): Promise<Stop[]> {
		const dbc = tx ?? this.driver.db
		// The entry's own stop (every notice of an issue's stop carries it), and the asks folded into a digest.
		const own = dbc.select({ id: transcriptEntries.stopId }).from(transcriptEntries).where(eq(transcriptEntries.id, entryId))
		const carried = dbc.select({ id: transcriptEntries.id }).from(transcriptEntries).where(eq(transcriptEntries.digestEntryId, entryId))
		const rows = await dbc
			.select()
			.from(stops)
			.where(or(inArray(stops.id, own), eq(stops.askEntryId, entryId), inArray(stops.askEntryId, carried)))
			.orderBy(asc(stops.raisedAt))
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
			outputMode: row.outputMode,
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
			outputMode: entity.outputMode,
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
			level: entry.level ?? null,
			routing: entry.routing ?? null,
			stopId: entry.stopId ?? null,
			digestEntryId: entry.digestEntryId ?? null,
			addresseeId: entry.addresseeId ?? null,
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
			ask: stop.ask ?? null,
			seq: stop.seq ?? null,
			dueAt: stop.dueAt ?? null,
			askEntryId: stop.askEntryId ?? null,
			answer: stop.answer ?? null,
			answeredBy: stop.answeredBy ?? null,
		}
	}

	// No casts, same reason as `toEntry`: `issue_stops.kind` and `.resolution` carry `$type<…>()`. The two
	// JSON columns are PARSED — their shape is the core's (`StopAskSchema` / `StopAnswerSchema`), never
	// redeclared on the table, so the read is where it is checked.
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
			ask: row.ask == null ? undefined : StopAskSchema.parse(row.ask),
			seq: row.seq ?? undefined,
			dueAt: row.dueAt ?? undefined,
			askEntryId: row.askEntryId ?? undefined,
			answer: row.answer == null ? undefined : StopAnswerSchema.parse(row.answer),
			answeredBy: row.answeredBy ?? undefined,
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
			level: row.level ?? undefined,
			routing: row.routing ?? undefined,
			stopId: row.stopId ?? undefined,
			digestEntryId: row.digestEntryId ?? undefined,
			addresseeId: row.addresseeId ?? undefined,
			at: row.at,
		}
	}
}
