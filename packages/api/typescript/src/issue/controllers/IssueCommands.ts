import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { StopResolution, IssueArchiveReason } from '@template/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { ArchiveIssue } from '../usecases/ArchiveIssue'
import { RestoreIssue } from '../usecases/RestoreIssue'
import { SteerIssue } from '../usecases/SteerIssue'
import { ResolveStop } from '../usecases/ResolveStop'
import { UpdateStopCriteriaConfig } from '../usecases/UpdateStopCriteriaConfig'

const IssueParam = z.object({ ctx: z.object({ ownerId: z.uuid() }), params: z.object({ issueId: z.uuid() }) })

// C26 ArchiveIssue
export const ArchiveIssueControllerInputSchema = IssueParam
export const ArchiveIssueControllerOutputSchema = z.void()

@injectable()
export class ArchiveIssueController extends Controller<typeof ArchiveIssueControllerInputSchema, typeof ArchiveIssueControllerOutputSchema> {
	readonly path = '/issues/:issueId/archive'
	readonly method = 'post' as const
	readonly description = 'Archive an issue (C26)'
	readonly inputSchema = ArchiveIssueControllerInputSchema
	readonly outputSchema = ArchiveIssueControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: ArchiveIssue) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({ ownerId: request.ctx.ownerId, issueId: request.params.issueId, reason: IssueArchiveReason.MANUAL })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}

// C27 RestoreIssue
export const RestoreIssueControllerInputSchema = IssueParam
export const RestoreIssueControllerOutputSchema = z.void()

@injectable()
export class RestoreIssueController extends Controller<typeof RestoreIssueControllerInputSchema, typeof RestoreIssueControllerOutputSchema> {
	readonly path = '/issues/:issueId/restore'
	readonly method = 'post' as const
	readonly description = 'Restore an archived issue (C27)'
	readonly inputSchema = RestoreIssueControllerInputSchema
	readonly outputSchema = RestoreIssueControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: RestoreIssue) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({ ownerId: request.ctx.ownerId, issueId: request.params.issueId })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}

// C22 SteerIssue
export const SteerIssueControllerInputSchema = IssueParam.extend({ body: z.object({ text: z.string().trim().min(1) }) })
export const SteerIssueControllerOutputSchema = z.object({ entryId: z.uuid() })

@injectable()
export class SteerIssueController extends Controller<typeof SteerIssueControllerInputSchema, typeof SteerIssueControllerOutputSchema> {
	readonly path = '/issues/:issueId/steer'
	readonly method = 'post' as const
	readonly description = 'Whisper a steer scoped to one issue (C22)'
	readonly inputSchema = SteerIssueControllerInputSchema
	readonly outputSchema = SteerIssueControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: SteerIssue) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.useCase.execute({ ownerId: request.ctx.ownerId, issueId: request.params.issueId, text: request.body.text })
		return { status: HttpStatusCode.CREATED, data }
	}
}

// C25 ResolveStop
export const ResolveStopControllerInputSchema = z.object({
	ctx: z.object({ ownerId: z.uuid() }),
	params: z.object({ stopId: z.uuid() }),
	body: z.object({ resolution: z.enum(StopResolution) }),
})
export const ResolveStopControllerOutputSchema = z.void()

@injectable()
export class ResolveStopController extends Controller<typeof ResolveStopControllerInputSchema, typeof ResolveStopControllerOutputSchema> {
	readonly path = '/stops/:stopId/resolve'
	readonly method = 'post' as const
	readonly description = 'Resolve a stop — retry / review&send / take over / approve / deny (C25)'
	readonly inputSchema = ResolveStopControllerInputSchema
	readonly outputSchema = ResolveStopControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: ResolveStop) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({ ownerId: request.ctx.ownerId, stopId: request.params.stopId, resolution: request.body.resolution })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}

// C29 UpdateStopCriteriaConfig
export const UpdateStopCriteriaControllerInputSchema = z.object({
	ctx: z.object({ ownerId: z.uuid() }),
	body: z.object({
		stopCriteria: z.object({
			serverErrors: z.boolean(),
			blockedByClassification: z.boolean(),
			humanRequested: z.boolean(),
			approvalNeeded: z.boolean(),
		}),
	}),
})
export const UpdateStopCriteriaControllerOutputSchema = z.void()

@injectable()
export class UpdateStopCriteriaController extends Controller<
	typeof UpdateStopCriteriaControllerInputSchema,
	typeof UpdateStopCriteriaControllerOutputSchema
> {
	readonly path = '/settings/stop-criteria'
	readonly method = 'put' as const
	readonly description = 'Update the global stop-criteria toggles (C29)'
	readonly inputSchema = UpdateStopCriteriaControllerInputSchema
	readonly outputSchema = UpdateStopCriteriaControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: UpdateStopCriteriaConfig) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({ ownerId: request.ctx.ownerId, stopCriteria: request.body.stopCriteria })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
