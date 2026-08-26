import { injectable } from 'tsyringe-neo'
import { BaseError } from '@codm/core-typescript'
import type { BaseInterfaceErrors, HttpControllerRequest, HttpMiddlewareResponse, Middleware } from '@codm/core-typescript'
import { SessionSchema } from '@shared/schemas'
import { BetterAuth } from '../services/Authentication/BetterAuth'
import { OwnerDirectory } from '@shared/services/OwnerDirectory'

/**
 * Valida a sessão do better-auth e anexa a forma canônica do `SessionSchema` em `request.ctx`:
 *   ctx.user    — { id, email, name, emailVerified }
 *   ctx.session — { id, userId, expiresAt, ownerId }
 *
 * ── por que ele passou a existir aqui: o buraco que ele fecha ────────────────────────────────────
 * `/session` monta SOMENTE na nuvem (`PLACEMENT`: `auth` é cloud-only desde o ADR 0001), mas
 * declarava o `CloudSessionMiddleware` — que lê `CloudSession.identity()`, um CACHE EM DISCO da
 * máquina do operador, e **não olha o header `Authorization`**. No processo de nuvem esse cache
 * nunca é populado: ninguém chama `setToken` lá. O resultado, medido: o `fetchIdentity()` do
 * daemon local — `getSession({ baseURL: CODM_CLOUD_URL, headers: { Bearer } })` — não podia dar
 * certo NUNCA, porque a porta que ele chama ignora a credencial que ele apresenta.
 *
 * O que mantinha a identidade de pé era o `GET /entitlement`, o único que lia o Bearer — isto é,
 * o endpoint de entitlement estava fazendo o trabalho do de sessão. Com este middleware no lugar
 * certo, `/session` volta a ser quem responde "quem é você", e o entitlement deixa de precisar
 * existir para essa pergunta.
 *
 * Nada disso aparecia em teste porque a revalidação faz as duas chamadas por trás de um seam
 * `protected` que os testes substituem — as duas eram faladas, nenhuma era exercida.
 *
 * ── o campo que a nuvem devolve NÃO se chama `ownerId` ───────────────────────────────────────────
 * O `additionalFields` do better-auth (ver `BetterAuth.ts`) declara `activeOwnerId`; `ownerId` é o
 * NOSSO nome, mapeado abaixo ao montar o `ctx`. Exigir `ownerId` do payload cru rejeitaria toda
 * sessão — foi exatamente esse o defeito que o repo de referência registra ter custado um `Invalid
 * session structure` em todas as rotas escopadas por dono.
 *
 * ── e o Bearer funciona por causa do plugin ──────────────────────────────────────────────────────
 * `auth.api.getSession` resolve tanto por cookie (o browser, depois do OAuth) quanto por
 * `Authorization: Bearer <token de sessão>` (o desktop) — a segunda metade existe porque o plugin
 * `bearer` está montado. Uma credencial, um verificador, duas formas de transporte.
 */
@injectable()
export class AuthAccountMiddleware implements Middleware {
	constructor(
		private readonly betterAuth: BetterAuth,
		private readonly owners: OwnerDirectory,
	) {}

	async execute(request: HttpControllerRequest<unknown>): Promise<HttpMiddlewareResponse<void>> {
		const response = await this.betterAuth.auth.api.getSession({
			headers: request.raw.headers as Headers,
			asResponse: true,
		})

		if (!response.ok) throw new BaseError<BaseInterfaceErrors>('UNAUTHORIZED')

		const rawSession = await response.json()

		const BetterAuthSessionSchema = SessionSchema.extend({
			session: SessionSchema.shape.session.omit({ ownerId: true }).extend({
				activeOwnerId: SessionSchema.shape.session.shape.ownerId.optional(),
			}),
		})

		const validated = BetterAuthSessionSchema.safeParse(rawSession)
		if (!validated.success) throw new BaseError<BaseInterfaceErrors>('UNAUTHORIZED', 'Invalid session structure')

		request.ctx = {
			...request.ctx,
			user: validated.data.user,
			session: {
				id: validated.data.session.id,
				userId: validated.data.session.userId,
				expiresAt: validated.data.session.expiresAt,
				// CURA A SESSÃO VELHA, em vez de propagar o `null`.
				//
				// O `activeOwnerId` é carimbado no NASCIMENTO da sessão (`session.create.before`), então
				// toda sessão criada antes daquele hook existir carrega `null` — e nada a corrigiria,
				// porque nem `user.create` nem `session.create` rodam de novo para ela. Medido em
				// 2026-08-17: o operador reusava uma sessão de dois dias antes e levava
				// `expected string, received null at ctx.session.ownerId` em toda rota escopada.
				//
				// `ensureOwnerFor` é idempotente: para quem já tem dono é uma leitura. O custo é uma
				// consulta a mais só no caminho em que a alternativa é o operador não conseguir usar o
				// produto.
				ownerId: validated.data.session.activeOwnerId ?? (await this.owners.ensureOwnerFor({ userId: validated.data.session.userId })),
			},
		}

		return {}
	}
}
