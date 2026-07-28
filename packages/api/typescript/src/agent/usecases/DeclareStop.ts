import { injectable } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { Handler, z, BaseError } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { StopKind } from '@codedm/contracts-typescript/wire/enums'
import { AgentRunStopRaisedEvent } from '../events/AgentRunStopRaisedEvent'
import { FactSource } from '../enums'
import { isTransportStopKind } from '../enums/TransportStopKind'
import type { AgentDomainErrors } from '../errors'

export const DeclareStopInputSchema = z.object({
	ownerId: z.uuid(),
	issueId: z.uuid(),
	threadId: z.uuid(),
	/**
	 * Kept on the FULL frozen `StopKind` rather than a narrowed mirror: §8 rule 5 forbids redeclaring a
	 * value-set contracts already owns. The narrowing to the DOMAIN half is the handler's job below,
	 * and it is one membership test.
	 */
	kind: z.enum(StopKind),
	detail: z.string().trim().min(1).max(4000),
})

export const DeclareStopOutputSchema = z.object({ stopId: z.uuid() })

/**
 * The agent DECLARES that it is blocked (GOAL-agent-abstraction §4.4; the tool is `RaiseStop`).
 * "Asking for approval" is the `APPROVAL_NEEDED` case of this operation, not a separate one — the
 * model chooses the kind here, which is exactly what separates it from `AskOperator`, where the
 * handler fixes the kind and a `kind` key does not exist in the schema at all.
 *
 * ### A model may only raise a DOMAIN stop
 * `AUTH_REQUIRED` / `SERVER_ERROR` are TRANSPORT facts: the runner OBSERVES them on the process and
 * the stream, and they are always `INFERRED`. Letting a model declare one would let it manufacture an
 * observation about a subsystem it cannot see — and would put a `DECLARED` transport stop in the
 * ledger, making the `FactSource` column lie. The rejection is a DOMAIN error because the invariant is
 * about the vocabulary, not about the caller's credentials.
 */
@injectable()
export class DeclareStop extends Handler<typeof DeclareStopInputSchema, typeof DeclareStopOutputSchema> {
	readonly name = 'declare_stop' as const
	readonly inputSchema = DeclareStopInputSchema
	readonly outputSchema = DeclareStopOutputSchema

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		if (isTransportStopKind(input.kind)) {
			throw new BaseError<AgentDomainErrors>(
				'AGENT_TRANSPORT_STOP_NOT_DECLARABLE',
				`${input.kind} is a transport stop — it is observed by the runner, never declared`,
			)
		}

		const stopId = uuidv7()
		await this.withTransaction(tx, async tx => {
			await this.domainEventRepository.save(
				new AgentRunStopRaisedEvent({
					entityId: input.issueId,
					ownerId: input.ownerId,
					payload: {
						stopId,
						issueId: input.issueId,
						threadId: input.threadId,
						kind: input.kind,
						detail: input.detail,
						source: FactSource.DECLARED,
					},
				}),
				tx,
			)
		})
		return { stopId }
	}
}
