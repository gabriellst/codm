import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import { StopKind } from '@codm/contracts-typescript/wire/enums'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'

/**
 * THREAD ONLY, and the absent `ownerId` is deliberate. A stop is reached THROUGH its thread, and a
 * thread has exactly one owner — so an owner filter applied after `openStops(threadId)` can never
 * remove a row, which makes it dead code no test could ever turn red. `OpenIssuesReader.openIssues`,
 * the read this one sits beside in the same prompt, takes the same single argument for the same reason.
 */
export const GetOpenStopsInputSchema = z.object({ threadId: z.uuid() })

/**
 * ONE unanswered question, as the prompt needs to state it.
 *
 * `issueId` is OPTIONAL because a stop is a child of the THREAD, not of an issue (B4, decision 4): the
 * orchestrator's own needs-approval is raised before any issue exists, and a read that demanded an
 * issue would silently drop exactly those. `title` + `detail` are "o que foi perguntado" — the two
 * columns the `stops` table actually has for it; there is no third, longer question field, and the
 * resolution vocabulary (`StopResolution`) is a closed enum with no prose in it.
 */
export const OpenStopSchema = z.object({
	stopId: z.uuid(),
	issueId: z.uuid().optional(),
	kind: z.enum(StopKind),
	/** The short form — what the console shows as the headline of the card. */
	title: z.string(),
	/** The long form — what the agent actually wrote when it stopped. May be empty. */
	detail: z.string(),
})

export const GetOpenStopsOutputSchema = z.object({ stops: z.array(OpenStopSchema) })

/**
 * The unanswered questions of ONE thread — AC-4's read (issue-resume spec, decision 7).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A USE CASE HERE AND NOT AN ENDPOINT ANYWHERE
 * Decision 7 says it out loud: "se o prompt do orquestrador precisar de um read novo (stops abertos
 * por thread), ele é um query use case do lado do agente, não um endpoint público". Its only consumer
 * is the prompt builder of a run this process starts itself, so an HTTP door would generate a React
 * Query hook with no caller and widen the SDK for nobody. The console already has its own read of the
 * same rows — `GetNeedsYouPanel` — shaped for a screen instead of for a sentence.
 *
 * WHY IT READS THROUGH `ThreadRepository` AND NOT THROUGH DRIZZLE
 * `openStops` already exists and already means exactly this ("unresolved stops of a thread, WITH and
 * WITHOUT an issue"). Going to the table directly would mean a second definition of "open" — the
 * `resolved_at IS NULL` predicate copied into the agent context — and would add an `agent → thread`
 * TABLE_READ_EDGE for a question the repository surface already answers. The declared edge
 * (`agent → thread`, repositories) covers this with no new coupling.
 *
 * THE ORDER IS PART OF THE CONTRACT, not an accident of the query plan: oldest first, so the prompt
 * reads the questions in the order they were asked. `raisedAt` alone can tie (two stops raised in the
 * same millisecond), so the uuidv7 `stopId` — which is itself time-ordered — breaks it.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
@injectable()
export class GetOpenStops extends Handler<typeof GetOpenStopsInputSchema, typeof GetOpenStopsOutputSchema> {
	readonly name = 'get_open_stops' as const
	readonly inputSchema = GetOpenStopsInputSchema
	readonly outputSchema = GetOpenStopsOutputSchema

	constructor(private readonly threads: ThreadRepository) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const open = await this.threads.openStops(input.threadId)

		const stops = open
			.sort((a, b) => a.raisedAt.getTime() - b.raisedAt.getTime() || a.stopId.localeCompare(b.stopId))
			.map(stop => ({
				stopId: stop.stopId,
				issueId: stop.issueId,
				kind: stop.kind,
				title: stop.title,
				detail: stop.detail,
			}))

		return { stops }
	}
}
