import { injectable } from 'tsyringe-neo'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { Handler, z, BaseError, DrizzleClient } from '@codedm/core-typescript'
import { threads, transcriptEntries, workspaces, channels, stops } from '@codedm/contracts/db'
import {
	ThreadStatus,
	ChannelKind,
	ProviderKind,
	TranscriptKind,
	ClassificationMethod,
	StopKind,
} from '@codedm/contracts-typescript/wire/enums'
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
	autonomyCaption: z.string(),
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

/** Read — SessionChat (T09). The full thread conversation + control-plane state + composed active
 *  stops (from BC5). Composer is DIRECT while paused, STEER while agents are live. */
@injectable()
export class GetSessionChat extends Handler<typeof GetSessionChatInputSchema, typeof GetSessionChatOutputSchema> {
	readonly name = 'get_session_chat' as const
	readonly inputSchema = GetSessionChatInputSchema
	readonly outputSchema = GetSessionChatOutputSchema

	constructor(private readonly db: DrizzleClient) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const rows = await this.db.select().from(threads).where(eq(threads.id, input.threadId)).limit(1)
		const thread = rows[0]
		if (!thread || thread.ownerId !== input.ownerId) throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)

		const [workspaceRow] = await this.db.select({ path: workspaces.path }).from(workspaces).where(eq(workspaces.id, thread.workspaceId)).limit(1)
		const [channelRow] = await this.db.select({ kind: channels.platform }).from(channels).where(eq(channels.id, thread.channelId)).limit(1)

		const entries = await this.db.select().from(transcriptEntries).where(eq(transcriptEntries.threadId, input.threadId)).orderBy(asc(transcriptEntries.at))
		const stopRows = await this.db.select().from(stops).where(and(eq(stops.threadId, input.threadId), isNull(stops.resolvedAt)))

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
				status: thread.status as ThreadStatus,
				lastActivity: lastActivity.toISOString(),
			},
			paused: thread.paused,
			mentionGate,
			autonomyCaption: this.autonomyCaption(thread.paused, mentionGate),
			activeStops: stopRows.map(s => ({ stopId: s.id, kind: s.kind as StopKind, title: s.title, detail: s.detail, raisedAt: s.raisedAt.toISOString() })),
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
			composerMode: thread.paused ? 'DIRECT' : 'STEER',
		}
	}

	private autonomyCaption(paused: boolean, gate: { enabled: boolean; tag?: string }): string {
		if (paused) return "Paused — won't reply until resumed"
		if (gate.enabled) return `Only replies when mentioned with ${gate.tag}`
		return 'Autonomous — replies send without review'
	}
}
