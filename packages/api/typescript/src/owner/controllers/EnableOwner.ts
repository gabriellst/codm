import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares'
import { EnableOwner, EnableOwnerOutputSchema } from '../usecases/EnableOwner'

export const EnableOwnerControllerInputSchema = z
	.object({
		ctx: z.object({
			user: z.object({ id: z.string() }),
			session: z.object({ ownerId: z.uuid() }),
		}),
	})
	.example([
		{
			ctx: { user: { id: 'user-123' }, session: { ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' } },
		},
	])

export const EnableOwnerControllerOutputSchema = EnableOwnerOutputSchema.example([
	{ ownerId: '019e4d24-6524-7041-9e1c-8108180cddae', isDisabled: false },
])

@injectable()
export class EnableOwnerController extends Controller<typeof EnableOwnerControllerInputSchema, typeof EnableOwnerControllerOutputSchema> {
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
	readonly path = '/owners/enable'
	readonly method = 'post' as const
	readonly description = 'Re-enable a previously disabled owner (C20 EnableOwner; OWNER only)'
	readonly inputSchema = EnableOwnerControllerInputSchema
	readonly outputSchema = EnableOwnerControllerOutputSchema

	override middlewares = [AuthAccountMiddleware]

	constructor(private enableOwner: EnableOwner) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.enableOwner.execute({
			ownerId: request.ctx.session.ownerId,
			enabledByUserId: request.ctx.user.id,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
