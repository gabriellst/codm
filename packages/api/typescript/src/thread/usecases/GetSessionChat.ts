import { injectable } from 'tsyringe-neo'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { Handler, z, BaseError, DrizzleClient } from '@codm/core-typescript'
import { threads, transcriptEntries, workspaces, channels, stops } from '@codm/contracts/db'
import { ThreadStatusDeriver } from '../services/ThreadStatusDeriver'
import {
	ThreadStatus,
	ChannelKind,
	ProviderKind,
	TranscriptKind,
	ClassificationMethod,
	StopKind,
} from '@codm/contracts-typescript/wire/enums'
import type { ApplicationErrors } from '../errors'

export const GetSessionChatInputSchema = z.object({ ownerId: z.uuid(), threadId: z.uuid() })

export const GetSessionChatOutputSchema = z.object({
	thread: z.object({
		threadId: z.uuid(),
		displayName: z.string(),
		channelKind: z.enum(ChannelKind),
		workspacePath: z.string(),
		providers: z.array(z.enum(ProviderKind)),
		status: z.enum(ThreadStatus),
		lastActivity: z.string(),
	}),
	paused: z.boolean(),
	mentionGate: z.discriminatedUnion('enabled', [
		z.object({ enabled: z.literal(false) }),
		z.object({ enabled: z.literal(true), tag: z.string() }),
	]),
	/* D5 — there is deliberately no `autonomyCaption` here any more. It shipped a finished English
	   SENTENCE ("Paused — won't reply until resumed") from the daemon into a Portuguese console, where
	   no amount of frontend i18n could reach it. Nothing replaces it: the caption is derivable from
	   `paused` + `mentionGate`, both already on this payload, so the browser composes it in the
	   operator's own language. A read model ships STATE; prose is the view's job. */
	activeStops: z.array(z.object({ stopId: z.uuid(), kind: z.enum(StopKind), title: z.string(), detail: z.string(), raisedAt: z.string() })),
	transcript: z.array(
		z.object({
			entryId: z.uuid(),
			kind: z.enum(TranscriptKind),
			text: z.string(),
			at: z.string(),
			issueId: z.uuid().optional(),
			provider: z.enum(ProviderKind).optional(),
			quotedEntryId: z.string().optional(),
			classification: z.enum(ClassificationMethod).optional(),
		}),
	),
	composerMode: z.enum(['STEER', 'DIRECT']),
})

/**
 * Read — SessionChat (T09). The full thread conversation + control-plane state + composed active
 * stops (from BC5).
 *
 * ### `composerMode` is a STATE, not a preference (F4)
 * The console used to render this as the SEED of a two-way toggle the operator could flip on every
 * message, which made "what does Enter do" a question with no answer visible from the conversation.
 * It is now the whole decision, and the rule is the founder's: **paused → STEER, running → DIRECT.**
 *
 * Read it as "who is my typing FOR". A paused thread answers nobody, so what the operator types is
 * instruction for the agents — queued as a steer and acted on when the thread resumes. A running
 * thread is a live conversation the orchestrator is already holding, so what the operator types is
 * for the PEOPLE in it, and goes out as their own message.
 *
 * Note this INVERTS the previous mapping, which was `paused ? DIRECT : STEER`.
 */
@injectable()
export class GetSessionChat extends Handler<typeof GetSessionChatInputSchema, typeof GetSessionChatOutputSchema> {
	readonly name = 'get_session_chat' as const
	readonly inputSchema = GetSessionChatInputSchema
	readonly outputSchema = GetSessionChatOutputSchema

	constructor(
		private readonly db: DrizzleClient,
		private readonly statuses: ThreadStatusDeriver,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const rows = await this.db.select().from(threads).where(eq(threads.id, input.threadId)).limit(1)
		const thread = rows[0]
		if (!thread || thread.ownerId !== input.ownerId)
			throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)

		const [workspaceRow] = await this.db
			.select({ path: workspaces.path })
			.from(workspaces)
			.where(eq(workspaces.id, thread.workspaceId))
			.limit(1)
		const [channelRow] = await this.db.select({ kind: channels.platform }).from(channels).where(eq(channels.id, thread.channelId)).limit(1)

		const entries = await this.db
			.select()
			.from(transcriptEntries)
			.where(eq(transcriptEntries.threadId, input.threadId))
			.orderBy(asc(transcriptEntries.at))
		const stopRows = await this.db
			.select()
			.from(stops)
			.where(and(eq(stops.threadId, input.threadId), isNull(stops.resolvedAt)))

		// The header's status is DERIVED, like the dashboard's — `threads.status` only ever holds IDLE or
		// PAUSED, so reading it made a thread with an agent mid-run present itself as idle. The three reads
		// behind it live in `ThreadStatusDeriver` since B4; the `stopRows` query above stays because the
		// payload needs the STOPS THEMSELVES (`activeStops`), not the boolean.
		const status = await this.statuses.forThread(input.threadId)

		const mentionGate = thread.mentionGateEnabled
			? ({ enabled: true, tag: thread.mentionGateTag ?? '' } as const)
			: ({ enabled: false } as const)
		const lastActivity = entries.at(-1)?.at ?? thread.updatedAt

		return {
			thread: {
				threadId: thread.id,
				displayName: thread.contactDisplayName,
				channelKind: (channelRow?.kind ?? ChannelKind.WHATSAPP) as ChannelKind,
				workspacePath: workspaceRow?.path ?? '',
				providers: thread.providers as ProviderKind[],
				status,
				lastActivity: lastActivity.toISOString(),
			},
			paused: thread.paused,
			mentionGate,
			activeStops: stopRows.map(s => ({
				stopId: s.id,
				kind: s.kind as StopKind,
				title: s.title,
				detail: s.detail,
				raisedAt: s.raisedAt.toISOString(),
			})),
			transcript: entries.map(e => ({
				entryId: e.id,
				kind: e.kind as TranscriptKind,
				text: e.text,
				at: e.at.toISOString(),
				issueId: e.issueId ?? undefined,
				provider: (e.provider ?? undefined) as ProviderKind | undefined,
				quotedEntryId: e.quotedEntryId ?? undefined,
				classification: (e.classification ?? undefined) as ClassificationMethod | undefined,
			})),
			composerMode: thread.paused ? 'STEER' : 'DIRECT',
		}
	}
}
