// Resurrected from f21be114^ (the operator collapse) and adapted for SP2's cloud profile —
// social-only (GitHub + Google), no email/password, no MailSender.
//
// Scope of this cut: T1 wires the better-auth INSTANCE and its social providers so
// GET/POST /auth/* answers with GitHub + Google configured. The lifecycle bridge the original
// file had (`IdentityAuthHooks` — domain events on user/session create, password-reset emails) was
// removed with the operator collapse and is NOT recreated here: SP2 has no email/password screens
// (spec decision — social-only v1) and no BC1 identity domain-event flow in scope. `databaseHooks`
// is therefore dropped rather than wired to a bridge that no longer exists.
import { injectable } from 'tsyringe-neo'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { bearer } from 'better-auth/plugins/bearer'
import { oneTimeToken } from 'better-auth/plugins/one-time-token'
import { PgDatabaseDriver, Config, Id } from '@codm/core-typescript'
import * as schema from '@codm/contracts/db/pg'
import { IdentityAuthHooks } from '../IdentityAuthHooks'

/**
 * As origens do DESKTOP, que o webview usa ao falar com a nuvem.
 *
 * Sem elas o `signIn.social` do client do better-auth é barrado: o console roda dentro de um
 * webview, cuja origem não é a da nuvem, e o `trustedOrigins` é a lista de CSRF/cookie DELE — o
 * `CORS_ALLOWED_ORIGINS` governa outra coisa (o allowlist de JSON da API em geral).
 *
 * Era exatamente esse bloqueio que obrigava o servidor a orquestrar o login por uma rota própria:
 * o docblock do `LoginSection` registra que apontar direto para `/auth/sign-in/social` deu 404
 * (aquele endpoint é POST; abrir o navegador do sistema é GET) e que fazer o POST do webview
 * esbarraria no CORS. Declarar a origem resolve a segunda metade — o POST passa a ser possível, e
 * o `disableRedirect` devolve a URL para o navegador do sistema abrir.
 *
 * Constantes e não env: são fixadas pela PLATAFORMA, não pelo deployment. O Tauri v2 serve o
 * webview de `tauri://localhost` no macOS/Linux e de `http://tauri.localhost` no Windows; em dev o
 * `devUrl` do `tauri.conf.json` é o vite em `http://localhost:5173`.
 */
const DESKTOP_ORIGINS = ['tauri://localhost', 'http://tauri.localhost', 'http://localhost:5173'] as const

/**
 * Quanto tempo vive o código de uso único que a ponte do desktop cunha, EM MINUTOS.
 *
 * Dois minutos é o valor que o `IssueDeviceCode` — o use case que este plugin substitui — usava
 * (`DEVICE_CODE_TTL_MS = 2 * 60 * 1000`). Está declarado aqui em vez de herdar o default do plugin
 * (3) porque a janela é a de um redirecionamento de browser para um deep link: o código nasce e é
 * resgatado no mesmo gesto do usuário, e qualquer folga além disso é só superfície.
 */
const DEVICE_CODE_TTL_MINUTES = 2

/**
 * A vida da SESSÃO, declarada — e não herdada — porque a credencial que ela substitui não expirava.
 *
 * O `DeviceToken` que o desktop guardava na keychain só morria por revogação. Trocá-lo pela sessão
 * do better-auth sem dizer nada faria o operador cair no default de 7 dias e ser deslogado numa
 * semana, sem que ninguém tivesse decidido isso. Trinta dias com `updateAge` de um dia significa:
 * quem usa o app com alguma regularidade nunca é deslogado (cada uso além de 24h renova a janela),
 * e um token roubado de uma máquina abandonada morre sozinho — que é o que o token eterno anterior
 * nunca fazia.
 */
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30
const SESSION_REFRESH_SECONDS = 60 * 60 * 24

/**
 * O tipo da instância, DERIVADO da construção real — e não de `ReturnType<typeof betterAuth>`.
 *
 * Aquela forma dava `Auth<BetterAuthOptions>`: o parâmetro genérico no seu topo, sem os PLUGINS que
 * esta instância monta. O campo `auth` da classe então re-alargava tudo, e
 * `auth.api.generateOneTimeToken` — que só existe porque `oneTimeToken()` está na lista — sumia do
 * tipo (medido: TS2339 no `DesktopCallback`). Derivar da fábrica preserva a lista inteira, e é o que
 * faz um plugin removido virar erro de compilação em quem o usava, em vez de 404 em produção.
 */
export type BetterAuthInstance = ReturnType<typeof buildAuthInstance>

/**
 * Social-provider credentials threaded into better-auth's `socialProviders`. A proper DI TOKEN
 * (abstract class, not an interface/plain-object type) so tsyringe's own paramtype auto-injection
 * resolves it like any other constructor dependency — see the per-env binding in `auth/registry.ts`
 * (`real` derives from `Config.env.GITHUB_*`/`GOOGLE_*`; `integration` binds a known fixture).
 *
 * The seam exists so a test can assert against a KNOWN fake id instead of the ambient `.env` value
 * (CI has no real secrets; BetterAuth.test.ts owns the value it asserts on). Earlier revision of
 * this seam used a plain-object constructor param with a `Config.env`-reading default — that traded
 * this problem for a worse one: tsyringe auto-resolves an interface-typed param as `Object` (no
 * runtime type to look up), silently injecting `{}` and wiping every credential in PRODUCTION, not
 * just tests. Making this an actual class turns it into a normal, correctly-resolved DI dependency.
 */
export abstract class BetterAuthSocialProviders {
	abstract githubClientId: string
	abstract githubClientSecret: string
	abstract googleClientId: string
	abstract googleClientSecret: string
}

// @injectable(), not @singleton() — this token's singleton-ness is owned by the registry
// ({ token: BetterAuth, mock: null, real: BetterAuth } in auth/registry.ts), same pattern as the
// original file's IdentityAuthHooks sibling.
@injectable()
export class BetterAuth {
	readonly auth: BetterAuthInstance

	constructor(driver: PgDatabaseDriver, socialProviders: BetterAuthSocialProviders, hooks: IdentityAuthHooks) {
		this.auth = buildAuthInstance(driver, socialProviders, hooks)
	}
}

/**
 * A construção da instância, isolada num módulo para que `BetterAuthInstance` possa DERIVAR dela.
 *
 * `satisfies`, e NÃO `const options: BetterAuthOptions`. A anotação alargava o literal antes do
 * `betterAuth()` inferir, e junto com o alargamento ia embora a lista de plugins. O `satisfies` faz
 * a mesma checagem que a anotação fazia, sem apagar o que o literal sabe.
 */
function buildAuthInstance(driver: PgDatabaseDriver, socialProviders: BetterAuthSocialProviders, hooks: IdentityAuthHooks) {
	const options = {
		baseURL: Config.env.CODM_CLOUD_URL,
		basePath: '/auth',
		secret: Config.env.BETTER_AUTH_SECRET,
		// better-auth's OWN CSRF/cookie trust list — the cloud deployment's own origin. Distinct
		// from CORS_ALLOWED_ORIGINS, which governs the general API's cross-origin JSON allowlist.
		trustedOrigins: [Config.env.CODM_CLOUD_URL, ...DESKTOP_ORIGINS],
		// Force UUIDv7 ids for users/sessions/accounts/verifications so they stay consistent with
		// every other entity id in the system (Id.value()) instead of better-auth's default
		// alphanumeric generator.
		advanced: { database: { generateId: () => Id.value() } },
		database: drizzleAdapter(driver.db, {
			// POSTGRES, e o comentário anterior conta por que isto voltou. Ele dizia: *"CODM persists
			// to a single SQLite file (libsql), not Postgres — the resurrected file targeted 'pg';
			// this is the load-bearing delta for this fork."* Aquilo valia enquanto havia UM substrato.
			//
			// O ADR 0005 partiu o schema em dois troncos e o ADR 0002 aloca `auth` na NUVEM — que
			// roda pg. Então este serviço estava cravado na família ERRADA para o único deployment em
			// que ele monta: sob `CODM_PROFILE=cloud` o token `PgDatabaseDriver` nem está ligado.
			// A nuvem subia porque `/auth/ok` não toca o banco; o primeiro sign-in de verdade
			// explodiria.
			provider: 'pg',
			schema: {
				user: schema.users,
				session: schema.sessions,
				account: schema.accounts,
				verification: schema.verificationTokens,
			},
		}),
		session: {
			expiresIn: SESSION_TTL_SECONDS,
			updateAge: SESSION_REFRESH_SECONDS,
			additionalFields: {
				// Reserved for the owner-switching seam (see auth/schemas/SessionSchema.ts) — not
				// set at sign-in time, populated by a future SetActiveOwner use case. Exposed here so
				// a later AuthAccountMiddleware can read it straight off the better-auth session
				// output; better-auth includes declared additionalFields in its default session
				// response, so no customSession plugin is needed just to surface this field.
				activeOwnerId: {
					type: 'string',
					required: false,
					defaultValue: null,
					input: false,
				},
			},
		},
		socialProviders: {
			github: {
				clientId: socialProviders.githubClientId,
				clientSecret: socialProviders.githubClientSecret,
			},
			google: {
				clientId: socialProviders.googleClientId,
				clientSecret: socialProviders.googleClientSecret,
			},
		},
		/**
		 * O CICLO DE VIDA — cada callback é UMA chamada, zero regra de negócio neste literal.
		 *
		 * É o que faltava para uma conta nova ser utilizável. Sem o `user.create`, ninguém provisiona o
		 * Owner; sem o `session.create`, o `activeOwnerId` nasce nulo e todo controller gateado (que
		 * declara `ctx.ownerId: z.uuid()`) responde 400 — inclusive o `GetOnboarding`, que é como o
		 * console descobriria que precisa de onboarding. O comentário no topo deste arquivo dizia que o
		 * bridge original "NÃO é recriado aqui": era verdade, e custava exatamente isso.
		 *
		 * `session.create.BEFORE`, e não `after`: o `activeOwnerId` é COLUNA da sessão, então carimbá-lo
		 * antes da escrita dispensa um segundo UPDATE e fecha a janela em que a sessão existe sem dono.
		 * O `SetActiveOwner` continua sendo o caminho para TROCAR de dono depois; este hook só decide o
		 * inicial.
		 */
		databaseHooks: {
			user: {
				create: {
					after: async user => hooks.onUserCreated({ userId: user.id, email: user.email, name: user.name }),
				},
			},
			session: {
				create: {
					before: async session => ({
						data: { ...session, activeOwnerId: (await hooks.sessionContext(session.userId)).activeOwnerId },
					}),
				},
			},
		},
		/**
		 * OS DOIS PLUGINS QUE SUBSTITUEM QUATRO ROTAS NOSSAS.
		 *
		 * `bearer` — deixa a sessão viajar em `Authorization: Bearer <token>` em vez de cookie. É o
		 * que permite o desktop guardar UMA credencial na keychain e usá-la em toda chamada; sem
		 * ele, cada consumidor de token teria de extrair o header à mão, que era exatamente a
		 * função `bearerToken()` duplicada nos controllers de `entitlement` e `revoke`.
		 *
		 * `oneTimeToken` — cunha um código de uso único a partir de uma sessão de browser e o
		 * troca de volta por sessão noutro processo. É, linha a linha, o que `IssueDeviceCode` e
		 * `ExchangeDeviceCode` faziam sobre uma tabela própria: gerar aleatório, gravar com prazo,
		 * consumir uma vez só. A regra do repo é explícita sobre isto — *"auth tokens, sessions,
		 * password resets → owned by better-auth, not modeled"*.
		 *
		 * `disableClientRequest: true` é uma trava que a versão anterior NÃO tinha e que passa a
		 * existir de graça: a rota HTTP `/auth/one-time-token/generate` fica fechada, e o código
		 * só pode ser cunhado por dentro (`auth.api.generateOneTimeToken`), pela ponte do desktop.
		 * Sem ela, qualquer portador de um cookie de sessão poderia fabricar códigos de pareamento.
		 *
		 * NÃO foi escolhido o `device-authorization`: ele é o RFC 8628, o fluxo em que o usuário LÊ
		 * um código na tela do app e o DIGITA no browser. O fluxo daqui é outro — o browser já tem
		 * a sessão e devolve o código pelo LISTENER DE LOOPBACK do app (RFC 8252), sem o usuário
		 * transcrever nada.
		 */
		plugins: [bearer(), oneTimeToken({ expiresIn: DEVICE_CODE_TTL_MINUTES, disableClientRequest: true })],
	} satisfies BetterAuthOptions
	return betterAuth(options)
}
