import { injectable } from 'tsyringe-neo'
import { BaseError, Controller, z } from '@codm/core-typescript'
import { GroupOutputMode, McpScope } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import type { ApplicationErrors } from '../errors'
import { ThreadParam } from '../schemas'

export const ConfigureOutputModeControllerInputSchema = ThreadParam.extend({
	body: z.object({ mode: z.enum(GroupOutputMode) }),
}).example([
	{
		ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
		params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' },
		body: { mode: GroupOutputMode.DECISIONS_AND_LIVE },
	},
])
export const ConfigureOutputModeControllerOutputSchema = z.void()

/**
 * How much of what its issues say reaches this group (fase 3, item 2) — decisions only, decisions and
 * previews/closings (the default), or everything.
 *
 * DECLARED, NOT YET WIRED (slice S0b): the route, its MCP tool and its SDK hook exist so the console's
 * selector can be built against them; `Thread.configureOutputMode` + the settings read land in S8a. Until
 * then it refuses with `OUTPUT_POLICY_NOT_READY` — a silent 204 would tell the caller the mode changed.
 */
@injectable()
export class ConfigureOutputModeController extends Controller<
	typeof ConfigureOutputModeControllerInputSchema,
	typeof ConfigureOutputModeControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system, McpScope.orchestration]
	readonly path = '/threads/:threadId/output-mode'
	readonly method = 'put' as const
	readonly description = "Choose how much of its tasks' output this conversation's group receives"
	readonly inputSchema = ConfigureOutputModeControllerInputSchema
	readonly outputSchema = ConfigureOutputModeControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	async handle(_request: this['input']): Promise<this['output']> {
		throw new BaseError<ApplicationErrors>('OUTPUT_POLICY_NOT_READY', 'the group output mode lands in fase 3, slice S8a')
	}
}
