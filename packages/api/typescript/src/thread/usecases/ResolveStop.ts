import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { StopResolution } from '@codm/contracts-typescript/wire/enums'
import { ThreadRepository } from '../repositories/ThreadRepository'
import type { ApplicationErrors } from '../errors'
import type { AgentInterfaceErrors } from '@agent/errors'

export const ResolveStopInputSchema = z.object({
	ownerId: z.uuid(),
	stopId: z.uuid(),
	resolution: z.enum(StopResolution),
	/**
	 * The thread an IN-RUN caller is confined to — `ctx.agentIdentity.threadId` when the caller is an
	 * orchestration run, absent when it is the console operator (who carries no run token at all).
	 * Moved in from `ResolveStopController` (import-direction#R1 — the ownership check below needs a
	 * repository read, which is exactly what a controller may not do itself).
	 */
	runThreadId: z.uuid().optional(),
})
export const ResolveStopOutputSchema = z.void()

/**
 * C25 ResolveStop — the operator answers a stop.
 *
 * Orchestration only, which is the point of the change: the three rules that decide whether a
 * resolution is legal (the stop belongs to this thread, it is still open, the resolution applies to the
 * kind) are invariants of `Thread.resolveStop` now. This use case looks the stop up, checks tenancy,
 * hands both to the aggregate, and commits the write together with the fact the aggregate raised.
 * `RESOLUTION_NOT_APPLICABLE` used to be thrown HERE against a table imported from `issue/objects`.
 *
 * `thread.stop_resolved` → `integration.thread.stop_resolved` is bridged by
 * `PublishThreadIntegrationEvents`; TAKE_OVER additionally pauses the thread on the consuming side.
 *
 * ### The `runThreadId` ownership check — moved in from the controller (import-direction#R1)
 * `runThreadId` is present ONLY for an orchestration run; the console operator carries none, and the
 * check below is skipped entirely for it — the same `if (identity) { ... }` guard the controller used
 * to hold, now expressed as "the field arrived" instead of "the ctx object is there". When present, an
 * in-run caller may only resolve a stop that is BOTH open AND on its own thread — read through the
 * thread's own open-stop seam rather than by stop id, so "is it yours" and "is it still open" are ONE
 * question, the same posture `SteerIssueTurn` takes on issues. A stop of another thread and an
 * already-answered stop of this one are refused identically; answering differently would make this an
 * oracle for stop ids. The console path keeps the precise `STOP_ALREADY_RESOLVED` / `STOP_NOT_FOUND`
 * verdicts below, because this guard never runs for it. Runs BEFORE the `findStop` lookup, on purpose —
 * a run confined to another thread must be refused with the SAME `AGENT_RUN_SCOPE_MISMATCH` whether or
 * not `stopId` even exists, exactly as the controller's pre-use-case check used to behave.
 */
@injectable()
export class ResolveStop extends Handler<typeof ResolveStopInputSchema, typeof ResolveStopOutputSchema> {
	readonly name = 'resolve_stop' as const
	readonly inputSchema = ResolveStopInputSchema
	readonly outputSchema = ResolveStopOutputSchema

	constructor(private readonly threads: ThreadRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		if (input.runThreadId !== undefined) {
			const open = await this.threads.openStops(input.runThreadId)
			if (!open.some(stop => stop.stopId === input.stopId)) {
				throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_SCOPE_MISMATCH', 'no open stop with that id on this thread')
			}
		}

		const stop = await this.threads.findStop(input.stopId)
		if (!stop || stop.ownerId !== input.ownerId) throw new BaseError<ApplicationErrors>('STOP_NOT_FOUND', `no stop ${input.stopId}`)

		const thread = await this.threads.findById(stop.threadId)
		if (!thread) throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${stop.threadId}`)

		await this.withTransaction(tx, async tx => {
			thread.resolveStop(stop, input.resolution)
			await this.threads.save(thread, tx)
			// The aggregate raised the fact; the use case owns the transaction, so the drain happens here —
			// unlike Go, where the repository pulls. First TS call site of a mechanism `BaseEntity` has
			// always had.
			await this.domainEventRepository.saveMany(thread.pullDomainEvents(), tx)
		})
	}
}
