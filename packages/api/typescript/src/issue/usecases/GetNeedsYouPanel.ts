import { injectable } from 'tsyringe-neo'
import { and, eq, isNull } from 'drizzle-orm'
import { Handler, z, DrizzleClient } from '@codedm/core-typescript'
import { stops, issues } from '@codedm/contracts/db'
import { StopKind, StopResolution } from '@codedm/contracts-typescript/wire/enums'
import { resolutionsForKind } from '../objects/StopResolutions'

export const GetNeedsYouPanelInputSchema = z.object({ ownerId: z.uuid(), threadId: z.uuid() })
export const GetNeedsYouPanelOutputSchema = z.object({
	stops: z.array(
		z.object({
			stopId: z.uuid(),
			issueId: z.uuid(),
			issueKey: z.string(),
			kind: z.enum(StopKind),
			title: z.string(),
			detail: z.string(),
			raisedAt: z.string(),
			availableResolutions: z.array(z.enum(StopResolution)),
		}),
	),
})

/** Read — NeedsYouPanel (T14). Every open stop on a thread with its per-kind resolution actions.
 *  Multiple simultaneous stops per thread are ALL listed (the modeling's hot spot). */
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
			.innerJoin(issues, eq(stops.issueId, issues.id))
			.where(and(eq(stops.threadId, input.threadId), isNull(stops.resolvedAt)))

		return {
			stops: rows.map(r => ({
				stopId: r.stopId,
				issueId: r.issueId,
				issueKey: r.issueKey,
				kind: r.kind as StopKind,
				title: r.title,
				detail: r.detail,
				raisedAt: r.raisedAt.toISOString(),
				availableResolutions: resolutionsForKind(r.kind as StopKind),
			})),
		}
	}
}
