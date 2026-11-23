import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { BatchItemDestinationKind, BatchStatus } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { BatchSchema } from '@shared/objects'
import { GetBatch, GetBatchOutputSchema } from '../usecases/GetBatch'

export const GetBatchControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		params: z.object({ threadId: z.uuid(), batchCode: BatchSchema.shape.code }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae', batchCode: 'L-31' },
		},
	])

const ISSUE_A = '019e4d24-6524-7041-9e1c-8108180cddaf'
const ISSUE_B = '019e4d24-6524-7041-9e1c-8108180cddb1'

/** The batch, plus the key of every issue its destinations name — what the screen links to. */
export const GetBatchControllerOutputSchema = GetBatchOutputSchema.example([
	{
		code: 'L-31',
		status: BatchStatus.RECORDED,
		sourceEntryId: '019e4d24-6524-7041-9e1c-8108180cddb0',
		items: [
			{ n: 1, excerpt: 'trocar o texto do botão', destination: { kind: BatchItemDestinationKind.NEW_ISSUE, issueId: ISSUE_A } },
			{ n: 2, excerpt: 'o rodapé da página de preços', destination: { kind: BatchItemDestinationKind.ATTACHED, issueId: ISSUE_B } },
			{ n: 3, excerpt: 'refazer o logo', destination: { kind: BatchItemDestinationKind.DECLINED, reason: 'fora do escopo do projeto' } },
		],
		issues: [
			{ issueId: ISSUE_A, key: 'APP-42', title: 'Texto do botão' },
			{ issueId: ISSUE_B, key: 'APP-40', title: 'Página de preços' },
		],
	},
])

/**
 * One BATCH of a conversation (fase 4, item 5): every item, where it went, and the issues it names.
 * Console-only — no MCP scope.
 */
@injectable()
export class GetBatchController extends Controller<typeof GetBatchControllerInputSchema, typeof GetBatchControllerOutputSchema> {
	readonly path = '/ui/threads/:threadId/batches/:batchCode'
	readonly method = 'get' as const
	readonly description = "A conversation's batch: each listed item and where it went"
	readonly inputSchema = GetBatchControllerInputSchema
	readonly outputSchema = GetBatchControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private query: GetBatch) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({
			ownerId: request.ctx.ownerId,
			threadId: request.params.threadId,
			batchCode: request.params.batchCode,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
