import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z, PgDatabaseDriver } from '@codm/core-typescript'
import { users, sessions } from '@codm/contracts/db/pg'
import { eq } from 'drizzle-orm'

export const TestMintSessionInputSchema = z.object({
	body: z.object({
		email: z.email().default('operator@e2e.test'),
		name: z.string().default('E2E Operator'),
		/** O dono ativo carimbado na sessão. `null` reproduz "logado, ainda sem tenant" (ADR 0001). */
		ownerId: z.uuid().nullable().default(null),
	}),
})

export const TestMintSessionOutputSchema = z.object({
	token: z.string(),
	userId: z.string(),
	sessionId: z.string(),
})

/**
 * COSTURA TEST-ONLY DE IDENTIDADE — montada SOMENTE sob a coluna `e2e` (ver `auth/controllers/index.ts`,
 * `byEnvironment`) e recusada sob `NODE_ENV=production` pelo `setBoundedContextEnvironment`. Nunca
 * emitida na SDK/OpenAPI: a coleta de rotas roda sob `EMIT_OPENAPI`, que jamais seleciona `e2e`.
 * Mesma disciplina do `shared/controllers/TestIngressController` e do `agent/controllers/TestRunIssueTurn`.
 *
 * ── POR QUE ELA EXISTE ───────────────────────────────────────────────────────────────────────────
 * O ADR 0001 pôs `auth` e `owner` na nuvem, e o daemon LOCAL passou a perguntar quem é o operador
 * (`FileCloudSession.fetchSession` → `GET /session` com `Authorization: Bearer`). O e2e precisa,
 * portanto, de um device token que a nuvem aceite.
 *
 * O caminho de produção para obtê-lo é um handshake OAuth de device-code que entrega o callback ao
 * navegador PADRÃO DO SISTEMA (`CloudSessionService.openBrowser` / `onAuthCallback`) — o docblock de
 * `packages/e2e/utils/given/cloud.ts` já registrava, antes desta frente existir, que isso é
 * *"nothing this suite can drive"*. E a configuração do better-auth aqui não habilita
 * `emailAndPassword` (só social providers + os plugins `bearer` e `one-time-token`), então também não
 * há caminho programático de sign-up.
 *
 * Sobra a escrita direta — exatamente a escolha que o `TestIngressController` documenta do lado
 * local ao semear uma linha de projeção com "a direct upsert": quando o produtor legítimo do estado
 * é indirigível num teste, o harness escreve o ESTADO e deixa o resto do caminho real intacto. O que
 * segue exercitado de verdade aqui é tudo que vem DEPOIS do token: o plugin `bearer` resolvendo a
 * sessão, o `AuthAccountMiddleware` montando o `ctx`, o `FileCloudSession` cacheando por TTL, e o
 * `CloudSessionMiddleware` de cada controller local. Só a emissão da credencial é encurtada.
 *
 * ── O QUE ELA NÃO FAZ ────────────────────────────────────────────────────────────────────────────
 * Não cria `accounts` (a linha do provedor social): nada no caminho que o e2e exercita a lê — o
 * `getSession` do better-auth resolve por `sessions.token` e junta `users`. Criar uma conta falsa
 * seria inventar estado que o teste não usa, e que passaria a mentir sobre o formato do que o OAuth
 * de verdade grava.
 */
@injectable()
export class TestMintSessionController extends Controller<typeof TestMintSessionInputSchema, typeof TestMintSessionOutputSchema> {
	readonly path = '/_test/session'
	readonly method = 'post' as const
	readonly description = 'TEST-ONLY: mint a cloud session and return its bearer token'
	readonly inputSchema = TestMintSessionInputSchema
	readonly outputSchema = TestMintSessionOutputSchema

	constructor(private readonly driver: PgDatabaseDriver) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const { email, name, ownerId } = request.body

		const userId = crypto.randomUUID()
		const sessionId = crypto.randomUUID()
		// Opaco e único por chamada. O `sessions.token` é `unique`, então dois mints na mesma suíte não
		// podem colidir — e um token adivinhável seria um convite a um teste passar por acaso.
		const token = `e2e-${crypto.randomUUID()}-${crypto.randomUUID()}`.replaceAll('-', '')

		await this.driver.db
			.insert(users)
			.values({ id: userId, email, name, emailVerified: true })
			.onConflictDoUpdate({ target: users.email, set: { name } })

		const [existing] = await this.driver.db.select({ id: users.id }).from(users).where(eq(users.email, email))
		const resolvedUserId = existing?.id ?? userId

		await this.driver.db.insert(sessions).values({
			id: sessionId,
			userId: resolvedUserId,
			token,
			// Longe o suficiente para nenhuma spec expirar no meio, e uma data FIXA em vez de
			// `now + N`: um teste que dependa do relógio é um teste que falha numa sexta-feira.
			expiresAt: new Date('2099-12-31T00:00:00.000Z'),
			activeOwnerId: ownerId,
		})

		return { status: HttpStatusCode.OK, data: { token, userId: resolvedUserId, sessionId } }
	}
}
