import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares'
import { UpdateOwnerSettings, UpdateOwnerSettingsInputSchema } from '../usecases/UpdateOwnerSettings'

export const UpdateOwnerSettingsControllerInputSchema = z
	.object({
		ctx: z.object({
			session: z.object({ ownerId: z.uuid() }),
		}),
		// ownerId is supplied from ctx.session.ownerId — omitted from the HTTP surface.
		body: UpdateOwnerSettingsInputSchema.omit({ ownerId: true }),
	})
	.example([
		{
			ctx: { session: { ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' } },
			body: {
				name: 'New Acme',
				pictureUrl: 'https://cdn.example.com/new-logo.png',
				timezone: 'America/Sao_Paulo',
			},
		},
	])

export const UpdateOwnerSettingsControllerOutputSchema = z.void()

@injectable()
export class UpdateOwnerSettingsController extends Controller<
	typeof UpdateOwnerSettingsControllerInputSchema,
	typeof UpdateOwnerSettingsControllerOutputSchema
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
	readonly path = '/owners/settings'
	readonly method = 'patch' as const
	readonly description = 'Update owner profile settings (name / picture / timezone)'
	readonly inputSchema = UpdateOwnerSettingsControllerInputSchema
	readonly outputSchema = UpdateOwnerSettingsControllerOutputSchema

	override middlewares = [AuthAccountMiddleware]

	constructor(private updateOwnerSettings: UpdateOwnerSettings) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		await this.updateOwnerSettings.execute({
			ownerId: request.ctx.session.ownerId,
			name: request.body.name,
			pictureUrl: request.body.pictureUrl,
			timezone: request.body.timezone,
		})
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
