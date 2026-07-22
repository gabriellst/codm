import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { GetIssuesOverview, GetIssuesOverviewOutputSchema } from '../usecases/GetIssuesOverview'
import { GetSessionIssues, GetSessionIssuesOutputSchema } from '../usecases/GetSessionIssues'
import { GetIssueDetail, GetIssueDetailOutputSchema } from '../usecases/GetIssueDetail'
import { GetNeedsYouPanel, GetNeedsYouPanelOutputSchema } from '../usecases/GetNeedsYouPanel'

// T04 IssuesOverview
export const GetIssuesOverviewControllerInputSchema = z.object({
	ctx: z.object({ ownerId: z.uuid() }),
	query: z.object({ includeArchived: z.coerce.boolean().default(false) }),
})
export const GetIssuesOverviewControllerOutputSchema = GetIssuesOverviewOutputSchema

@injectable()
export class GetIssuesOverviewController extends Controller<
	typeof GetIssuesOverviewControllerInputSchema,
	typeof GetIssuesOverviewControllerOutputSchema
> {
	readonly path = '/issues'
	readonly method = 'get' as const
	readonly description = 'All issues across every thread, grouped by status (T04)'
	readonly inputSchema = GetIssuesOverviewControllerInputSchema
	readonly outputSchema = GetIssuesOverviewControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private query: GetIssuesOverview) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId, includeArchived: request.query.includeArchived })
		return { status: HttpStatusCode.OK, data }
	}
}

// T11 SessionIssues
export const GetSessionIssuesControllerInputSchema = z.object({ ctx: z.object({ ownerId: z.uuid() }), params: z.object({ threadId: z.uuid() }) })
export const GetSessionIssuesControllerOutputSchema = GetSessionIssuesOutputSchema

@injectable()
export class GetSessionIssuesController extends Controller<
	typeof GetSessionIssuesControllerInputSchema,
	typeof GetSessionIssuesControllerOutputSchema
> {
	readonly path = '/threads/:threadId/issues'
	readonly method = 'get' as const
	readonly description = 'Issues of one thread grouped by status + auto-archive note (T11)'
	readonly inputSchema = GetSessionIssuesControllerInputSchema
	readonly outputSchema = GetSessionIssuesControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private query: GetSessionIssues) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId })
		return { status: HttpStatusCode.OK, data }
	}
}

// T12 IssueDetail
export const GetIssueDetailControllerInputSchema = z.object({ ctx: z.object({ ownerId: z.uuid() }), params: z.object({ issueId: z.uuid() }) })
export const GetIssueDetailControllerOutputSchema = GetIssueDetailOutputSchema

@injectable()
export class GetIssueDetailController extends Controller<typeof GetIssueDetailControllerInputSchema, typeof GetIssueDetailControllerOutputSchema> {
	readonly path = '/issues/:issueId'
	readonly method = 'get' as const
	readonly description = 'One issue drill-down: terminal log, routed messages, stops (T12)'
	readonly inputSchema = GetIssueDetailControllerInputSchema
	readonly outputSchema = GetIssueDetailControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private query: GetIssueDetail) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId, issueId: request.params.issueId })
		return { status: HttpStatusCode.OK, data }
	}
}

// T14 NeedsYouPanel
export const GetNeedsYouPanelControllerInputSchema = z.object({ ctx: z.object({ ownerId: z.uuid() }), params: z.object({ threadId: z.uuid() }) })
export const GetNeedsYouPanelControllerOutputSchema = GetNeedsYouPanelOutputSchema

@injectable()
export class GetNeedsYouPanelController extends Controller<
	typeof GetNeedsYouPanelControllerInputSchema,
	typeof GetNeedsYouPanelControllerOutputSchema
> {
	readonly path = '/threads/:threadId/needs-you'
	readonly method = 'get' as const
	readonly description = 'Active stops on a thread with per-kind resolution actions (T14)'
	readonly inputSchema = GetNeedsYouPanelControllerInputSchema
	readonly outputSchema = GetNeedsYouPanelControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private query: GetNeedsYouPanel) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId })
		return { status: HttpStatusCode.OK, data }
	}
}
