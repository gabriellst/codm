import { injectable } from 'tsyringe-neo'
import { and, eq, isNull } from 'drizzle-orm'
import { Handler, z, DrizzleClient } from '@codm/core-typescript'
import { stops, issues } from '@codm/contracts/db'
import { StopKind, StopResolution } from '@codm/contracts-typescript/wire/enums'
import { resolutionsForKind } from '../objects/StopResolutions'

export const GetNeedsYouPanelInputSchema = z.object({ ownerId: z.uuid(), threadId: z.uuid() })
export const GetNeedsYouPanelOutputSchema = z.object({
	stops: z.array(
		z.object({
			stopId: z.uuid(),
			/**
			 * OPTIONAL since B4 (AC-9). A thread-level stop has no issue, and a required key here would
			 * have kept the panel unable to render the very case decision 4 exists to enable.
			 */
			issueId: z.uuid().optional(),
			issueKey: z.string().optional(),
			kind: z.enum(StopKind),
			title: z.string(),
			detail: z.string(),
			raisedAt: z.string(),
			availableResolutions: z.array(z.enum(StopResolution)),
		}),
	),
})

/**
 * Read — NeedsYouPanel (T14). Every open stop on a thread with its per-kind resolution actions.
 * Multiple simultaneous stops per thread are ALL listed (the modeling's hot spot).
 *
 * ### `leftJoin`, not `innerJoin` (B4, AC-9)
 * With `issue_id` nullable, the `innerJoin` this had would SILENTLY DISCARD every stop without an issue
 * — the exact inverse of what decision 4 enables. The panel is the surface where a thread-level
 * needs-approval has to appear; a join that drops it turns the feature into a no-op nobody sees fail.
 *
 * Lives in `thread/` since B4: its output IS stops, and stops belong to this aggregate. The HTTP path
 * (`/threads/:threadId/needs-you`) is unchanged — controllers own their paths and the mount is uniform.
 */
@injectable()
export class GetNeedsYouPanel extends Handler<typeof GetNeedsYouPanelInputSchema, typeof GetNeedsYouPanelOutputSchema> {
	readonly name = 'get_needs_you_panel' as const
	readonly inputSchema = GetNeedsYouPanelInputSchema
	readonly outputSchema = GetNeedsYouPanelOutputSchema

	constructor(private readonly db: DrizzleClient) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const rows = await this.db
			.select({
				stopId: stops.id,
				issueId: stops.issueId,
				issueKey: issues.key,
				kind: stops.kind,
				title: stops.title,
				detail: stops.detail,
				raisedAt: stops.raisedAt,
			})
			.from(stops)
			.leftJoin(issues, eq(stops.issueId, issues.id))
			// TENANCY, and it is a NAMED tightening (see the Scope fence): `ownerId` was already on the
			// input and already passed by the controller from `ctx`, and it was already unused — so any
			// caller who knew a thread id could read another owner's stops. The sibling read guards
			// (`GetSessionChat` throws THREAD_NOT_FOUND on an owner mismatch); this one silently did not.
			// One predicate, in a file this Task rewrites anyway, over an indexed column that exists.
			.where(and(eq(stops.ownerId, input.ownerId), eq(stops.threadId, input.threadId), isNull(stops.resolvedAt)))

		return {
			stops: rows.map(r => ({
				stopId: r.stopId,
				issueId: r.issueId ?? undefined,
				issueKey: r.issueKey ?? undefined,
				// No cast: `issue_stops.kind` carries `$type<StopKind>()`, and a `leftJoin` widens only the
				// RIGHT side (`issues.key`), so the left columns keep their declared types.
				kind: r.kind,
				title: r.title,
				detail: r.detail,
				raisedAt: r.raisedAt.toISOString(),
				availableResolutions: resolutionsForKind(r.kind),
			})),
		}
	}
}
