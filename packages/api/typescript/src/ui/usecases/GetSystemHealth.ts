import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, z } from '@codm/core-typescript'
import { QuotaStatusReader, quotaSnapshotOf } from '@agent/services/QuotaStatusReader'
import { QuotaSnapshotSchema } from '@shared/objects'
import type { ApplicationErrors } from '../errors'

export const GetSystemHealthInputSchema = z.object({ ownerId: z.uuid() })
export const GetSystemHealthOutputSchema = QuotaSnapshotSchema

/**
 * Read — the system's QUOTA HEALTH for the console's strip (fase 4, item 7): what the dispatcher last saw of the
 * budget, the task slots (effective vs configured, and what limits them) and the free disk, plus the task queue now.
 * The agent owns all of it (`QuotaStatusReader`); this only shapes it (`quotaSnapshotOf`).
 *
 * Before the dispatcher's first loop there is nothing to show — `HEALTH_NOT_SAMPLED`, never invented numbers.
 */
@injectable()
export class GetSystemHealth extends Handler<typeof GetSystemHealthInputSchema, typeof GetSystemHealthOutputSchema> {
	readonly name = 'get_system_health' as const
	readonly inputSchema = GetSystemHealthInputSchema
	readonly outputSchema = GetSystemHealthOutputSchema

	constructor(private readonly quota: QuotaStatusReader) {
		super()
	}

	protected async handle(): Promise<this['output']> {
		const status = this.quota.current()
		if (!status) throw new BaseError<ApplicationErrors>('HEALTH_NOT_SAMPLED', 'the dispatcher has not run its first loop yet')
		return quotaSnapshotOf(status, await this.quota.queue())
	}
}
