import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { StopResolution } from '@codedm/contracts-typescript/wire/enums'
import { StopRepository } from '../repositories/StopRepository'
import { isResolutionApplicable } from '../objects/StopResolutions'
import { IssueStopResolvedEvent } from '../events'
import type { ApplicationErrors } from '../errors'

export const ResolveStopInputSchema = z.object({ ownerId: z.uuid(), stopId: z.uuid(), resolution: z.enum(StopResolution) })
export const ResolveStopOutputSchema = z.void()

/**
 * C25 ResolveStop — the resolution must match the stop kind (`RESOLUTION_NOT_APPLICABLE` — e.g.
 * APPROVE only on APPROVAL_NEEDED). Publishes `issue.stop_resolved` → `integration.issue.stop_resolved`;
 * TAKE_OVER additionally pauses the thread (BC4 reacts to the integration event).
 */
@injectable()
export class ResolveStop extends Handler<typeof ResolveStopInputSchema, typeof ResolveStopOutputSchema> {
	readonly name = 'resolve_stop' as const
	readonly inputSchema = ResolveStopInputSchema
	readonly outputSchema = ResolveStopOutputSchema

	constructor(private readonly stops: StopRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const stop = await this.stops.findById(input.stopId)
		if (!stop || stop.ownerId !== input.ownerId) throw new BaseError<ApplicationErrors>('STOP_NOT_FOUND', `no stop ${input.stopId}`)
		if (!isResolutionApplicable(stop.kind, input.resolution)) {
			throw new BaseError<ApplicationErrors>('RESOLUTION_NOT_APPLICABLE', `${input.resolution} does not apply to a ${stop.kind} stop`)
		}

		await this.withTransaction(tx, async tx => {
			await this.stops.resolve(input.stopId, input.resolution, tx)
			await this.domainEventRepository.save(
				new IssueStopResolvedEvent({
					entityId: stop.issueId,
					ownerId: stop.ownerId,
					payload: { stopId: stop.stopId, issueId: stop.issueId, threadId: stop.threadId, resolution: input.resolution },
				}),
				tx,
			)
		})
	}
}
