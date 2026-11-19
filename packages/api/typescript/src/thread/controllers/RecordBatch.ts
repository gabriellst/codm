import { injectable } from 'tsyringe-neo'
import { BaseError, Controller, z } from '@codm/core-typescript'
import { BatchItemDestinationKind, McpScope, PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { AgentRunIdentityCtxSchema } from '@agent/types/AgentRunIdentity'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { BATCH_ITEMS_MAX, BatchItemSchema, BatchSchema } from '@shared/objects'
import { ThreadParam } from '../schemas'
import type { ApplicationErrors } from '../errors'

export const RecordBatchControllerInputSchema = ThreadParam.extend({
	// The run identity `AgentIdentityMiddleware` stamps on a tool call — composed so Zod does not strip it.
	ctx: z.object({ ownerId: z.uuid() }).extend(AgentRunIdentityCtxSchema.shape),
	body: z.object({
		/** The batch's code as the item that brought it said (`L-31`). */
		batchCode: BatchSchema.shape.code,
		/** One entry per item of the batch: its number and where it went — every item 1..N exactly once. */
		items: z
			.array(BatchItemSchema.pick({ n: true, destination: true }))
			.min(1)
			.max(BATCH_ITEMS_MAX),
	}),
}).example([
	{
		ctx: {
			ownerId: '00000000-0000-4000-8000-000000000001',
			agentIdentity: {
				ownerId: '00000000-0000-4000-8000-000000000001',
				threadId: '019e4d24-6524-7041-9e1c-8108180cddae',
				entryId: '019e4d24-6524-7041-9e1c-8108180cddb0',
				scope: McpScope.orchestration,
				posture: PermissionPosture.AUTO,
			},
		},
		params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' },
		body: {
			batchCode: 'L-31',
			items: [
				{ n: 1, destination: { kind: BatchItemDestinationKind.NEW_ISSUE, issueId: '019e4d24-6524-7041-9e1c-8108180cddaf' } },
				{ n: 2, destination: { kind: BatchItemDestinationKind.DECLINED, reason: 'fora do escopo do projeto' } },
			],
		},
	},
])
export const RecordBatchControllerOutputSchema = z.void()

/**
 * The orchestrator records WHERE EACH ITEM OF A BATCH WENT (fase 4, item 5) — a new task, guidance to an
 * existing one, already live, declined, deferred, or waiting on a decision. Every item 1..N needs exactly
 * one destination; with all of them recorded, the receipt goes to the group.
 *
 * DECLARED, NOT YET WIRED (slice S0b): the tool exists on the MCP surface and the HTTP contract; the use
 * case (`RecordBatch`, with the `Batch` aggregate) lands in S8. Until then it refuses with
 * `THROUGHPUT_NOT_READY` — never a 2xx that would tell the model the batch was recorded.
 */
@injectable()
export class RecordBatchController extends Controller<typeof RecordBatchControllerInputSchema, typeof RecordBatchControllerOutputSchema> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.orchestration]
	readonly path = '/threads/:threadId/batches/record'
	readonly method = 'post' as const
	readonly description = 'Record where each item of a batch (a message listing several requests) went — every item exactly once'
	readonly inputSchema = RecordBatchControllerInputSchema
	readonly outputSchema = RecordBatchControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	async handle(_request: this['input']): Promise<this['output']> {
		throw new BaseError<ApplicationErrors>('THROUGHPUT_NOT_READY', 'RecordBatch lands in fase 4, slice S8')
	}
}
