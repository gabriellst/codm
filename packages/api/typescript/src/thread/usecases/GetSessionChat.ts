import { injectable } from 'tsyringe-neo'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { Handler, z, BaseError, DrizzleClient } from '@codm/core-typescript'
import { threads, transcriptEntries, workspaces, channels, remotes, stops } from '@codm/contracts/db'
import { ThreadStatusDeriver } from '../services/ThreadStatusDeriver'
import { OPERATOR_PARTICIPANT_ID } from '../objects'
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
		/**
		 * The conversation's OWN face — the same three facts every `sender` below carries, for the
		 * counterparty this whole thread is with (a person in a 1:1, the group itself in a group).
		 *
		 * Flat rather than nested because `displayName` right above completes the quartet; see the note
		 * on `GetHomeDashboard`'s `ThreadSummarySchema`, which spells the identical shape for the sidebar.
		 */
		channelId: z.uuid(),
		externalId: z.string(),
		hasAvatar: z.boolean(),
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
			/**
			 * WHO SPOKE — present only for a line somebody outside this system typed.
			 *
			 * Absent for every line the product itself produced: the agent's (`SYSTEM`), the operator's
			 * own (`DIRECT` / `WHISPER`, which the ingest attributes to the `operator` sentinel however
			 * many devices they were typed from), and the system's narration (`ACTION`). Those already
			 * have a caption the console composes from `kind`; borrowing a contact's face for them is
			 * exactly the confusion `Thread.recordEntry`'s kind×sender invariant exists to prevent.
			 *
			 * It matters most in a GROUP, where every inbound line is a different person and the bubble
			 * used to carry no attribution at all — the transcript said what was said and never who.
			 *
			 * `hasAvatar` rather than a url: the photo is served by `GET /ui/avatars/:channelId/:remoteId`
			 * (the daemon caches it — the platform's own url is signed, expiring and off-CSP), and the
			 * console addresses that endpoint through the SDK's generated query key, exactly as it does
			 * for artifact bytes. A url on the wire would be a second, hand-maintained copy of a route
			 * the SDK already describes.
			 */
			sender: z
				.object({
					/** The channel the contact lives on — half of the avatar endpoint's address. */
					channelId: z.uuid(),
					/** The platform's own id for them (a WhatsApp JID) — the other half. */
					externalId: z.string(),
					displayName: z.string(),
					hasAvatar: z.boolean(),
				})
				.optional(),
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
		// `deletedAt IS NULL` is part of the IDENTITY of the row this read is looking for (thread-deletion
		// spec, decision 5): an apagada conversation answers THREAD_NOT_FOUND, the same code an unknown id
		// and another owner's thread get. One indistinguishable 404 is the right answer — the console
		// routes away from all three identically, and the operator who just deleted it is not owed a
		// different word for "it is gone".
		const rows = await this.db
			.select()
			.from(threads)
			.where(and(eq(threads.id, input.threadId), isNull(threads.deletedAt)))
			.limit(1)
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

		// WHO SPOKE, resolved against the gateway's contact book — ONE query for the whole transcript,
		// keyed by the distinct senders on it, never one lookup per line.
		//
		// The scope is the thread's OWN channel, and the thread is already gated by owner above, so the
		// `channel_id` equality is the same `remotes → channels → owner` path the avatar endpoint walks
		// — `gateway_remotes` carries no owner of its own.
		//
		// The THREAD'S OWN counterparty rides in the same lookup rather than in a second query: it lives
		// on the same `(channel_id, remote_id)` key, and in a 1:1 it is usually one of the senders anyway.
		const lookupIds = [
			...new Set([
				thread.contactExternalId,
				...entries
					.map(e => e.senderExternalId)
					// The operator's lines are attributed to a SENTINEL, not to a JID (see
					// OPERATOR_PARTICIPANT_ID) — there is no contact row behind it and no face to draw.
					.filter((id): id is string => id !== null && id !== OPERATOR_PARTICIPANT_ID),
			]),
		]
		const remoteRows = await this.db
			.select({ remoteId: remotes.remoteId, name: remotes.name, avatarUrl: remotes.avatarUrl })
			.from(remotes)
			.where(and(eq(remotes.channelId, thread.channelId), inArray(remotes.remoteId, lookupIds)))
		const contactBook = new Map(remoteRows.map(r => [r.remoteId, r]))

		const mentionGate = thread.mentionGateEnabled
			? ({ enabled: true, tag: thread.mentionGateTag ?? '' } as const)
			: ({ enabled: false } as const)
		const lastActivity = entries.at(-1)?.at ?? thread.updatedAt

		return {
			thread: {
				threadId: thread.id,
				displayName: thread.contactDisplayName,
				channelId: thread.channelId,
				externalId: thread.contactExternalId,
				hasAvatar: Boolean(contactBook.get(thread.contactExternalId)?.avatarUrl),
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
				sender: this.senderOf(e.senderExternalId, thread.channelId, contactBook),
			})),
			composerMode: thread.paused ? 'STEER' : 'DIRECT',
		}
	}

	/**
	 * The identity to hang on one line, or nothing.
	 *
	 * A contact who is not (yet) in the gateway's book still gets a sender — with their JID as the
	 * name. The transcript knows somebody spoke; refusing to say so because the contact sync hasn't
	 * caught up would drop the attribution entirely, which is the state this whole field exists to end.
	 */
	private senderOf(
		senderExternalId: string | null,
		channelId: string,
		contactBook: Map<string, { name: string; avatarUrl: string | null }>,
	): { channelId: string; externalId: string; displayName: string; hasAvatar: boolean } | undefined {
		if (senderExternalId === null || senderExternalId === OPERATOR_PARTICIPANT_ID) return undefined
		const contact = contactBook.get(senderExternalId)
		return {
			channelId,
			externalId: senderExternalId,
			displayName: contact?.name || senderExternalId,
			hasAvatar: Boolean(contact?.avatarUrl),
		}
	}
}
