import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { Config, PGliteDriver, PgDatabaseDriver, asInjectionToken } from '@codm/core-typescript'
import { TestBed } from '@test/support'
import { INTEGRATION_SOCIAL_PROVIDERS_FIXTURE } from '@auth/registry'
import { sessions, users, verificationTokens } from '@codm/contracts/db/pg'
import { BetterAuth } from './BetterAuth'
import { SignInSocialController } from '@auth/controllers/SignInSocial'
import { BaseError } from '@codm/core-typescript'

// Hermetic — this asserts against the KNOWN fixture the `integration` env binds for
// BetterAuthSocialProviders (auth/registry.ts), not the ambient GITHUB_/GOOGLE_CLIENT_ID from
// Config.env. Asserting on the real env passes on a machine with a filled-in `.env` and fails on
// CI, which boots from `.env.example` (empty placeholders). The behavior actually under test — "the
// configured client id is threaded into better-auth's socialProviders and shows up in the authorize
// URL" — doesn't care what the value IS, only that OUR wiring carries it through, so BetterAuth is
// resolved normally via the DI registry (testBed.resolve) and the test imports the SAME fixture
// constant the registry's `integration` binding uses, instead of duplicating the literal.
const TEST_SOCIAL_PROVIDERS = INTEGRATION_SOCIAL_PROVIDERS_FIXTURE

describe('BetterAuth (integration)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let betterAuth: BetterAuth
	let cloudDriver: PGliteDriver

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })

		// UM POSTGRES DE VERDADE, porque este serviço fala pg — e o TestBed é libsql.
		//
		// O `auth` é CLOUD-ONLY na PLACEMENT (ADR 0002) e a nuvem roda a família `pg` (ADR 0005), então
		// o `BetterAuth` injeta `PgDatabaseDriver`. O TestBed monta o mundo do DESKTOP; pedir a ele um
		// driver pg seria pedir a coisa errada. O `PGliteDriver` é Postgres em processo, com o TRONCO
		// CLOUD migrado — as `authentication_*` que este serviço escreve nascem dele.
		//
		// Antes desta troca, `provider: 'sqlite'` apontava para o tronco do desktop: `/auth/ok`
		// passava (não toca o banco) e os dois casos abaixo falhavam, que é exatamente como o defeito
		// se apresentaria em produção — o boot sobe e o primeiro sign-in explode.
		cloudDriver = new PGliteDriver()
		await cloudDriver.runMigrations()
		testContainer.registerInstance(asInjectionToken(PgDatabaseDriver), cloudDriver)

		betterAuth = testBed.resolve(BetterAuth)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('mounts a working handler — GET /auth/ok responds', async () => {
		const request = new Request(`${Config.env.CODM_CLOUD_URL}/auth/ok`)
		const response = await betterAuth.auth.handler(request)

		expect(response.status).toBe(200)
	})

	it('GitHub is configured — signInSocial returns an authorize URL carrying the injected client id', async () => {
		const result = await betterAuth.auth.api.signInSocial({
			body: { provider: 'github', callbackURL: `${Config.env.CODM_CLOUD_URL}/desktop-callback` },
		})

		expect(result.url).toContain('github.com/login/oauth/authorize')
		expect(result.url).toContain(`client_id=${TEST_SOCIAL_PROVIDERS.githubClientId}`)
	})

	it('Google is configured — signInSocial returns an authorize URL carrying the injected client id', async () => {
		const result = await betterAuth.auth.api.signInSocial({
			body: { provider: 'google', callbackURL: `${Config.env.CODM_CLOUD_URL}/desktop-callback` },
		})

		expect(result.url).toContain('accounts.google.com/o/oauth2/v2/auth')
		expect(result.url).toContain(`client_id=${TEST_SOCIAL_PROVIDERS.googleClientId}`)
	})

	/**
	 * A TESTEMUNHA DO SUBSTRATO — o caso que fica vermelho se este serviço voltar a falar com o
	 * banco do DESKTOP.
	 *
	 * Os dois casos acima leem a URL de autorização e não tocam o banco: passavam igualmente com o
	 * driver ERRADO. Este vai à tabela — o `signInSocial` grava um registro de verificação com o
	 * `state` do OAuth, e lê-lo de volta pelo schema do tronco CLOUD só funciona se o driver
	 * injetado for o pg.
	 *
	 * FALSEADO: trocar a injeção de volta para `PgDatabaseDriver` deixa este caso VERMELHO.
	 *
	 * O QUE ELE NÃO PROVA, dito em vez de insinuado: o `provider: 'pg'` do adapter. Rodei o
	 * falseador trocando-o por `'sqlite'` e este caso ficou VERDE — o drizzle tolera a divergência
	 * nesta operação. O `provider` está certo porque o substrato é Postgres, não porque um teste o
	 * cobra; se alguém precisar dessa prova, ela pede uma operação cujo SQL difira por dialeto.
	 */
	it('DIA-01: o `signInSocial` GRAVA no tronco CLOUD — a prova de que o substrato é o Postgres', async () => {
		await betterAuth.auth.api.signInSocial({
			body: { provider: 'github', callbackURL: `${Config.env.CODM_CLOUD_URL}/desktop-callback` },
		})

		const rows = await cloudDriver.db.select().from(verificationTokens)
		expect(rows.length, 'sem a linha de verificação, o fluxo de OAuth não tem como voltar').toBeGreaterThan(0)
	})

	/**
	 * A TESTEMUNHA DAS ORIGENS DO DESKTOP.
	 *
	 * O console roda num webview cuja origem não é a da nuvem. Sem ela no `trustedOrigins`, o
	 * `signIn.social` do client é barrado por CSRF/CORS — que é precisamente por que existia uma rota
	 * própria no servidor para orquestrar o login (ver o docblock de `LoginSection`).
	 */
	it('DIA-02: as origens do DESKTOP são confiáveis — senão o client do webview é barrado', () => {
		const trusted = betterAuth.auth.options.trustedOrigins as string[]

		expect(trusted, 'macOS/Linux').toContain('tauri://localhost')
		expect(trusted, 'Windows').toContain('http://tauri.localhost')
		expect(trusted, 'o vite de dev — o `devUrl` do tauri.conf.json').toContain('http://localhost:5173')
		expect(trusted, 'e a própria nuvem continua confiável').toContain(Config.env.CODM_CLOUD_URL)
	})

	/**
	 * Semeia um usuário e uma sessão VIVOS direto no tronco de nuvem e devolve o token de sessão.
	 *
	 * Direto no banco, e não por um sign-in, porque este deployment é social-only: entrar de verdade
	 * exigiria falar com o GitHub. O que os casos abaixo exercitam não é o login — é o que acontece
	 * DEPOIS dele, com uma sessão que existe. Uma linha de sessão é exatamente o que o OAuth teria
	 * deixado, e o `token` dela é o que o desktop guarda na keychain.
	 */
	async function seedSession(suffix: string): Promise<{ token: string; userId: string }> {
		const userId = `usr-${suffix}`
		const token = `tok-${suffix}-${'0'.repeat(24)}`
		await cloudDriver.db.insert(users).values({ id: userId, email: `${suffix}@example.test`, emailVerified: true, name: 'Operator' })
		await cloudDriver.db.insert(sessions).values({
			id: `ses-${suffix}`,
			userId,
			token,
			expiresAt: new Date(Date.now() + 60 * 60 * 1000),
		})
		return { token, userId }
	}

	/**
	 * BRR-01 — O PLUGIN `bearer` RESOLVE UMA SESSÃO A PARTIR DO HEADER.
	 *
	 * Esta é a propriedade que o `AuthAccountMiddleware` inteiro pressupõe, e que o desktop depende
	 * para existir: ele guarda UM token e o apresenta em `Authorization: Bearer`. Sem o plugin, o
	 * `getSession` só entende cookie — e cookie é o que um daemon não tem.
	 *
	 * FALSIFICADO: remover `bearer()` da lista de plugins deixa este caso vermelho (a sessão volta
	 * `null`), e com ele caem `/session` e o `entitlement` que o daemon revalida.
	 */
	it('BRR-01: uma sessão viva é resolvida por `Authorization: Bearer <token>`', async () => {
		const { token, userId } = await seedSession('brr01')

		const session = await betterAuth.auth.api.getSession({
			headers: new Headers({ authorization: `Bearer ${token}` }),
		})

		expect(session?.user.id).toBe(userId)
	})

	/**
	 * OTT-01/02 — O CÓDIGO DE USO ÚNICO VAI E VOLTA, e é de USO ÚNICO.
	 *
	 * A viagem inteira que o login do desktop faz: a ponte cunha (`generateOneTimeToken`, a partir da
	 * sessão do browser) e o app resgata (`verifyOneTimeToken`, devolvendo a sessão). É o par que
	 * substituiu `IssueDeviceCode`/`ExchangeDeviceCode` e a tabela de tokens de dispositivo.
	 *
	 * O SEGUNDO resgate falhar é metade do valor deste caso: era uma propriedade que a tabela antiga
	 * garantia com um `UPDATE ... RETURNING` atômico, e que a troca precisava PRESERVAR — o
	 * `useDeepLinkAuth` deduplica por código justamente porque o macOS entrega o mesmo deep link duas
	 * vezes, e a segunda entrega tem de bater numa porta fechada.
	 */
	it('OTT-01/02: o código cunhado resgata a sessão — e só uma vez', async () => {
		const { token, userId } = await seedSession('ott01')
		const headers = new Headers({ authorization: `Bearer ${token}` })

		const { token: oneTime } = await betterAuth.auth.api.generateOneTimeToken({ headers })
		expect(oneTime).toBeTruthy()

		const redeemed = await betterAuth.auth.api.verifyOneTimeToken({ body: { token: oneTime } })
		expect(redeemed.user.id).toBe(userId)

		// A segunda entrega do MESMO deep link não pode render uma segunda sessão.
		expect(betterAuth.auth.api.verifyOneTimeToken({ body: { token: oneTime } })).rejects.toThrow()
	})

	/**
	 * OTT-03 — A PORTA DE CUNHAGEM ESTÁ FECHADA PARA A REDE.
	 *
	 * `disableClientRequest: true` faz `/auth/one-time-token/generate` recusar requisições HTTP,
	 * mesmo COM uma sessão válida — e é isso que o caso prova, apresentando um Bearer que o BRR-01
	 * mostrou ser suficiente para o `getSession`. Só a nossa ponte (`DesktopCallbackController`,
	 * chamando por dentro) cunha código.
	 *
	 * Sem esta trava, qualquer portador de sessão fabricaria códigos de pareamento pela rede — um
	 * caminho para transformar uma sessão de browser em N credenciais de dispositivo. A versão
	 * anterior, com rota própria, não tinha essa trava; ela nasce da troca, não sobrevive a ela.
	 *
	 * FALSIFICADO: remover `disableClientRequest` faz a rota responder 200 com um token, e o caso
	 * fica vermelho.
	 */
	it('OTT-03: a rota HTTP de cunhagem recusa, mesmo com sessão válida', async () => {
		const { token } = await seedSession('ott03')

		const response = await betterAuth.auth.handler(
			new Request(`${Config.env.CODM_CLOUD_URL}/auth/one-time-token/generate`, {
				headers: { authorization: `Bearer ${token}` },
			}),
		)

		expect(response.status).not.toBe(200)
	})

	/**
	 * SGI-01/02 — A PORTA DE LOGIN DEVOLVE UM 302 QUE CARREGA OS COOKIES DO FLUXO.
	 *
	 * O fluxo OAuth é stateful: o better-auth emite um cookie de `state` (e o verifier do PKCE) ao
	 * gerar a URL de autorização, e o confere quando o provedor devolve o browser. Quem inicia tem de
	 * ser quem conclui — e o desktop só consegue isso porque ESTA porta coloca o navegador do sistema
	 * na primeira ponta e lhe entrega os cookies.
	 *
	 * SGI-02 guarda a linha exata que já faltou duas vezes (2026-08-07 e 2026-08-15), com a mesma
	 * assinatura nas duas: `?error=state_mismatch` na volta do Google. FALSIFICADOR: apagar o laço
	 * `for (const cookie of signIn.headers.getSetCookie())` deixa SGI-02 vermelho — e é exatamente
	 * essa deleção que produziu o bug em produção.
	 */
	it('SGI-01: a porta de login responde 302 para o provedor', async () => {
		const controller = new SignInSocialController(betterAuth)
		const response = (await controller.handle({ query: { provider: 'google' } } as never)) as unknown as Response

		expect(response.status).toBe(302)
		expect(response.headers.get('location')).toContain('accounts.google.com')
	})

	it('SGI-02: o 302 REPASSA os cookies do better-auth — sem eles o callback recusa com state_mismatch', async () => {
		const controller = new SignInSocialController(betterAuth)
		const response = (await controller.handle({ query: { provider: 'google' } } as never)) as unknown as Response

		const cookies = response.headers.getSetCookie()
		expect(cookies.length, 'sem Set-Cookie o navegador do sistema chega ao provedor sem `state`').toBeGreaterThan(0)
		expect(cookies.join(';')).toContain('state')
	})

	/**
	 * SGI-03 — A RECUSA DO BETTER-AUTH CHEGA COM AS PALAVRAS DELE.
	 *
	 * O `provider` é validado por zod na porta, então este caso passa por baixo dela para exercitar o
	 * ramo que importa: o que acontece quando o better-auth diz não. Antes, era `throw new Error()` —
	 * que o `GlobalErrorMapper` traduz para UNKNOWN_ERROR/500, e a tela mostra "erro desconhecido"
	 * sobre um problema que TEM nome (credencial de provedor ausente é a causa típica).
	 *
	 * Agora sai `SOCIAL_SIGN_IN_FAILED` (502 — quem recusou foi o upstream, não esta porta), com o
	 * `code`/`message` da biblioteca embutidos na mensagem, que é a parte que resolve o problema.
	 */
	it('SGI-03: quando o better-auth recusa, o erro é SOCIAL_SIGN_IN_FAILED e carrega a causa dele', async () => {
		const controller = new SignInSocialController(betterAuth)

		let raised: unknown
		try {
			await controller.handle({ query: { provider: 'provedor-que-nao-existe' } } as never)
		} catch (error) {
			raised = error
		}

		expect(raised).toBeInstanceOf(BaseError)
		expect((raised as BaseError<'SOCIAL_SIGN_IN_FAILED'>).name).toBe('SOCIAL_SIGN_IN_FAILED')
		// A causa do better-auth sobrevive ao embrulho — é ela que diz o que corrigir.
		expect((raised as Error).message).toContain('provedor-que-nao-existe')
	})
})
