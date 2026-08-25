import { injectable } from 'tsyringe-neo'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { LibSqlDatabaseDriver, Handler, z, BaseError } from '@codm/core-typescript'
import { threads, transcriptEntries, workspaces, channels, remotes, stops, artifacts } from '@codm/contracts/db'
import { ThreadStatusDeriver } from '../services/ThreadStatusDeriver'
import { OPERATOR_PARTICIPANT_ID } from '../objects'
import {
	ThreadStatus,
	ChannelKind,
	ProviderKind,
	TranscriptKind,
	ClassificationMethod,
	StopKind,
	ArtifactKind,
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
			 * The artifact THIS entry delivered to the contact ("envio de artefatos pelo canal" design,
			 * decisions 4/8) — present only on the SYSTEM entry `DeliverChannelAttachment` writes, absent on
			 * every other entry (including a text-only SYSTEM reply). Never the artifact's `mediaPath` — that
			 * is the STAGED copy's absolute path on the daemon's disk, an internal I/O detail the console has
			 * no use for. The console fetches BYTES the same way it already does for a `RecordArtifact` card
			 * (`GET /threads/:threadId/artifacts/:artifactId/content`), keyed by `artifact.artifactId` below.
			 *
			 * Joined here — a direct read of `artifact_artifacts` by the entry's own `artifactId` column —
			 * rather than merged from the independent `ListArtifacts` read `SessionChatSection` already
			 * composes client-side: that composition exists to avoid a PERMANENT cross-context edge for the
			 * WHOLE artifact catalog, but this is the opposite shape — ONE row, addressed by a column this
			 * aggregate already owns (`thread_transcript_entries.artifact_id`, sibling table, same BFF read
			 * pattern this use case already uses for `channels`/`remotes`/`workspaces`).
			 */
			artifact: z
				.object({
					artifactId: z.uuid(),
					kind: z.enum(ArtifactKind),
					name: z.string(),
					ref: z.string(),
					meta: z.string(),
					recordedAt: z.string(),
				})
				.optional(),
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
		private readonly driver: LibSqlDatabaseDriver,
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
		const rows = await this.driver.db
			.select()
			.from(threads)
			.where(and(eq(threads.id, input.threadId), isNull(threads.deletedAt)))
			.limit(1)
		const thread = rows[0]
		if (!thread || thread.ownerId !== input.ownerId)
			throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)

		const [workspaceRow] = await this.driver.db
			.select({ path: workspaces.path })
			.from(workspaces)
			.where(eq(workspaces.id, thread.workspaceId))
			.limit(1)
		// `ownerRemoteId` vem junto porque é ele que dá rosto às linhas do PRÓPRIO operador — ver
		// `senderOf`. Uma query a mais seria uma query a mais para o mesmo id que já estamos lendo.
		const [channelRow] = await this.driver.db
			.select({ kind: channels.platform, ownerRemoteId: channels.ownerRemoteId })
			.from(channels)
			.where(eq(channels.id, thread.channelId))
			.limit(1)

		const entries = await this.driver.db
			.select()
			.from(transcriptEntries)
			.where(eq(transcriptEntries.threadId, input.threadId))
			.orderBy(asc(transcriptEntries.at))
		const stopRows = await this.driver.db
			.select()
			.from(stops)
			.where(and(eq(stops.threadId, input.threadId), isNull(stops.resolvedAt)))

		// The artifacts a SYSTEM entry delivered (`DeliverChannelAttachment`) — one query for the whole
		// transcript, keyed by the distinct `artifactId`s on it, same shape as the sender lookup below.
		// Empty when nothing on this thread has been sent through the channel yet.
		const artifactIds = [...new Set(entries.map(e => e.artifactId).filter((id): id is string => id !== null))]
		const artifactRows =
			artifactIds.length === 0
				? []
				: await this.driver.db
						.select({
							id: artifacts.id,
							kind: artifacts.kind,
							name: artifacts.name,
							ref: artifacts.ref,
							meta: artifacts.meta,
							recordedAt: artifacts.recordedAt,
						})
						.from(artifacts)
						.where(and(eq(artifacts.threadId, input.threadId), inArray(artifacts.id, artifactIds)))
		const artifactBook = new Map(artifactRows.map(a => [a.id, a]))

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
		// O SENTINELA DO OPERADOR TEM ROSTO, e é aqui que ele o recupera. As linhas do operador são
		// atribuídas a `OPERATOR_PARTICIPANT_ID` — não é um JID e nunca terá linha na agenda. Mas a
		// conta por trás dele tem: é o `owner_remote_id` do canal, a mesma que o cabeçalho resolve.
		// Trocamos um pelo outro no INSUMO da busca, então a linha do operador sai com nome e foto em
		// vez de ficar anônima só porque a atribuição usa um sentinela.
		//
		// Vazio (o default da coluna) e canal ausente degradam para o comportamento antigo: sem rosto,
		// nunca um erro — o chat não pode deixar de abrir porque a conta não foi projetada ainda.
		const operatorRemoteId = channelRow?.ownerRemoteId || null
		const lookupIds = [
			...new Set([
				thread.contactExternalId,
				...(operatorRemoteId === null ? [] : [operatorRemoteId]),
				...entries.map(e => e.senderExternalId).filter((id): id is string => id !== null && id !== OPERATOR_PARTICIPANT_ID),
			]),
		]
		const remoteRows = await this.driver.db
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
				artifact: this.artifactOf(e.artifactId, artifactBook),
				sender: this.senderOf(e.senderExternalId, thread.channelId, contactBook, operatorRemoteId),
			})),
			composerMode: thread.paused ? 'STEER' : 'DIRECT',
		}
	}

	/**
	 * The artifact one SYSTEM entry delivered, or nothing.
	 *
	 * Absent for every entry outside `artifactId` — including the degenerate case where the column is
	 * set but the artifact row is gone (never expected: `artifact_artifacts` rows are never deleted),
	 * which degrades to no artifact rather than a broken reference reaching the console.
	 */
	private artifactOf(
		artifactId: string | null,
		artifactBook: Map<string, { id: string; kind: ArtifactKind; name: string; ref: string; meta: string; recordedAt: Date }>,
	): { artifactId: string; kind: ArtifactKind; name: string; ref: string; meta: string; recordedAt: string } | undefined {
		if (artifactId === null) return undefined
		const artifact = artifactBook.get(artifactId)
		if (!artifact) return undefined
		return {
			artifactId: artifact.id,
			kind: artifact.kind,
			name: artifact.name,
			ref: artifact.ref,
			meta: artifact.meta,
			recordedAt: artifact.recordedAt.toISOString(),
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
		operatorRemoteId: string | null,
	): { channelId: string; externalId: string; displayName: string; hasAvatar: boolean } | undefined {
		if (senderExternalId === null) return undefined
		// O sentinela vira a conta conectada — a mesma troca feita no insumo da busca acima. Sem
		// `owner_remote_id` (canal antigo, ainda não projetado, ou desconectado) não há a quem apontar,
		// e a linha volta a ser anônima como era antes: degradação, nunca erro.
		const resolvedId = senderExternalId === OPERATOR_PARTICIPANT_ID ? operatorRemoteId : senderExternalId
		if (resolvedId === null) return undefined
		const contact = contactBook.get(resolvedId)
		return {
			channelId,
			externalId: resolvedId,
			displayName: contact?.name || resolvedId,
			hasAvatar: Boolean(contact?.avatarUrl),
		}
	}
}
