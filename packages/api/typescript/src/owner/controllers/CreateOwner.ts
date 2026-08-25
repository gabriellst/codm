import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { OwnerKind } from '@codm/contracts-typescript/wire/enums'
import { AuthAccountMiddleware } from '@auth/middlewares'
import { CreateOwner, CreateOwnerInputSchema } from '../usecases/CreateOwner'

export const CreateOwnerControllerInputSchema = z
	.object({
		ctx: z.object({
			user: z.object({ id: z.string() }),
		}),
		// userId is supplied from ctx.user.id — omitted from the HTTP surface.
		body: CreateOwnerInputSchema.omit({ userId: true }),
	})
	.example([
		{
			ctx: { user: { id: 'user-123' } },
			body: {
				name: 'Acme Org',
				kind: OwnerKind.ORGANIZATION,
				timezone: 'America/Sao_Paulo',
				pictureUrl: 'https://cdn.example.com/logo.png',
			},
		},
	])

export const CreateOwnerControllerOutputSchema = z
	.object({
		ownerId: z.uuid(),
	})
	.example([{ ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' }])

@injectable()
export class CreateOwnerController extends Controller<typeof CreateOwnerControllerInputSchema, typeof CreateOwnerControllerOutputSchema> {
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
	readonly path = '/owners'
	readonly method = 'post' as const
	readonly description = 'Create a new owner (tenant); the creator becomes the responsible user'
	readonly inputSchema = CreateOwnerControllerInputSchema
	readonly outputSchema = CreateOwnerControllerOutputSchema

	override middlewares = [AuthAccountMiddleware]

	constructor(private createOwner: CreateOwner) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.createOwner.execute({
			userId: request.ctx.user.id,
			name: request.body.name,
			kind: request.body.kind,
			timezone: request.body.timezone,
			pictureUrl: request.body.pictureUrl,
		})
		return { status: HttpStatusCode.CREATED, data }
	}
}
