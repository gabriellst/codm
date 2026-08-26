import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares'
import { SetActiveOwner, SetActiveOwnerOutputSchema } from '../usecases/SetActiveOwner'

export const SetActiveOwnerControllerInputSchema = z
	.object({
		params: z.object({
			ownerId: z.uuid(),
		}),
		ctx: z.object({
			user: z.object({ id: z.string() }),
			session: z.object({ id: z.string() }),
		}),
	})
	.example([
		{
			params: { ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' },
			ctx: {
				user: { id: 'user-001' },
				session: { id: 'sess-001' },
			},
		},
	])

export const SetActiveOwnerControllerOutputSchema = SetActiveOwnerOutputSchema.example([
	{ ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' },
])

@injectable()
export class SetActiveOwnerController extends Controller<
	typeof SetActiveOwnerControllerInputSchema,
	typeof SetActiveOwnerControllerOutputSchema
> {
	// SEM `mcpScopes` — removido na F7, e a remoção REDUZ exposição em vez de a ampliar.
	//
	// Ele dizia `[McpScope.system]`, e o comentário jurava "reachable as an MCP tool under this
	// surface — see agent/mcp/exposure.ts". Medido: aquele arquivo importa controllers de
	// `artifact`, `issue`, `thread`, `ui`, `workspace` e `agent` — e NÃO de `owner`. Nenhuma
	// ferramenta MCP jamais saiu daqui. A promessa do comentário nunca foi verdade.
	//
	// O que o escopo FAZIA de fato: `Controller.effectiveMiddlewares` anexa o
	// `AgentIdentityMiddleware` a todo controller com escopo não-vazio — de propósito, e o docblock
	// dele explica bem ("uma proteção que precisa ser lembrada separadamente é uma que pode ser
	// esquecida justamente onde importa"). Só que run tokens são cunhados por AGENTES, em memória,
	// por processo, e `agent` monta SÓ no local enquanto `owner` monta SÓ na nuvem
	// (`shared/deployment.ts`). Nenhum agente roda no processo que serve esta rota, logo nenhum token
	// válido pode existir aqui: a rota ficou inalcançável por TODO chamador — humano, console ou
	// agente — desde o split do ADR 0001.
	//
	// Ficou invisível porque a única prova que a exercitava era a `03-owner-create.spec.ts`, e o e2e
	// estava morto atrás de uma sonda de prontidão quebrada. É a mesma história dos outros três
	// defeitos que esta frente desenterrou.
	//
	// Sobra o `AuthAccountMiddleware` abaixo: sessão exigida, como em qualquer rota de nuvem. Se um
	// dia o agente do operador precisar operar tenants por MCP, isso volta COM a costura de
	// identidade cross-process que hoje não existe — e aí o escopo dirá algo verdadeiro.
	readonly path = '/owners/:ownerId/activate'
	readonly method = 'post' as const
	readonly description = 'Switch the authenticated session to the given owner (SPEC-07 SetActiveOwner)'
	readonly inputSchema = SetActiveOwnerControllerInputSchema
	readonly outputSchema = SetActiveOwnerControllerOutputSchema

	override middlewares = [AuthAccountMiddleware]

	constructor(private readonly setActiveOwner: SetActiveOwner) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const { ownerId } = request.params
		const { id: sessionId } = request.ctx.session
		const { id: userId } = request.ctx.user

		const data = await this.setActiveOwner.execute({ ownerId, userId, sessionId })

		return { status: HttpStatusCode.OK, data }
	}
}
