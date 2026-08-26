import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares'
import { DisableOwner, DisableOwnerInputSchema, DisableOwnerOutputSchema } from '../usecases/DisableOwner'

export const DisableOwnerControllerInputSchema = z
	.object({
		ctx: z.object({
			user: z.object({ id: z.string() }),
			session: z.object({ ownerId: z.uuid() }),
		}),
		// ownerId is supplied from ctx.session.ownerId, disabledByUserId from ctx.user.id — omitted from the HTTP surface.
		body: DisableOwnerInputSchema.omit({ ownerId: true, disabledByUserId: true }),
	})
	.example([
		{
			ctx: { user: { id: 'user-123' }, session: { ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' } },
			body: { reason: 'closing for maintenance' },
		},
	])

export const DisableOwnerControllerOutputSchema = DisableOwnerOutputSchema.example([
	{ ownerId: '019e4d24-6524-7041-9e1c-8108180cddae', isDisabled: true },
])

@injectable()
export class DisableOwnerController extends Controller<
	typeof DisableOwnerControllerInputSchema,
	typeof DisableOwnerControllerOutputSchema
> {
	// SEM `mcpScopes`, pelo MESMO motivo dos irmãos `CreateOwner`/`SetActiveOwner` — e esta segunda
	// leva existe porque a primeira parou no meio, o que uma aferição adversarial pegou.
	//
	// O contexto `owner` monta SÓ na nuvem; `agent` monta SÓ no local. Um escopo MCP faz o
	// `Controller` anexar o `AgentIdentityMiddleware`, e run tokens são cunhados por agentes, em
	// memória, por processo — logo nenhum token válido pode existir no processo que serve esta rota.
	// O escopo trancava a porta sem abrir nenhuma outra.
	//
	// O docblock de `agent/mcp/exposure.ts:123-126` registra que `ownerControllers` ESTEVE na lista de
	// varredura e saiu em 2026-08-14 (ADR 0001, W3 Task 4c). Estes três `mcpScopes` são o rastro que
	// aquela remoção deixou para trás: a lista foi limpa, as declarações nos controllers não.
	readonly path = '/owners/disable'
	readonly method = 'post' as const
	readonly description = 'Disable a owner (C19 DisableOwner; OWNER only)'
	readonly inputSchema = DisableOwnerControllerInputSchema
	readonly outputSchema = DisableOwnerControllerOutputSchema

	override middlewares = [AuthAccountMiddleware]

	constructor(private disableOwner: DisableOwner) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.disableOwner.execute({
			ownerId: request.ctx.session.ownerId,
			disabledByUserId: request.ctx.user.id,
			reason: request.body.reason,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
