// FIRST, above every import that can reach the kernel — see `./harnessDataDir`'s docblock: the
// kernel's `Config.env` is parsed at module import, so this module's assignment only lands if it
// evaluates before it. Moving this line down is a silent regression, which is why the boot below
// re-checks the OUTCOME.
import { HARNESS_DATA_DIR } from './harnessDataDir'
import 'reflect-metadata'
import { rmSync } from 'node:fs'
import { container } from 'tsyringe-neo'
import {
	Config,
	getBoundedContextEnvironment,
	LibSqlDatabaseDriver,
	resolve,
	setBoundedContextEnvironment,
	type Token,
	removeTempDirWhenFree,
} from '@codm/core-typescript'
import { CloudSession, MockCloudSession } from '@shared/services/CloudSession'
import { start, type RunningServer } from '../../composition/server'
import type { TestingSurface } from '../../testing'
import type { TestBedLike } from './given/types'
import { bootService, type RunningService } from './testBoot'
import type { TestBootWorkspaceId } from '../../../../../template.config'
import {
	givenUser,
	givenAccount,
	givenUserWithAccount,
	givenActiveSession,
	givenOwner,
	givenOwnerWithResponsible,
	givenWorkspace,
	givenThread,
	GIVEN_MENTION_TAG,
	givenChannel,
	givenConnectedGatewayChannel,
	givenRemote,
	givenRemoteMembership,
	givenIssue,
	givenStop,
	givenDomainEvent,
	givenUserProfile,
} from './given'

export type { TestBedLike } from './given/types'
export type { GatewayChannelSeed } from './given'

/**
 * THE TEST SHELL over the production boot (spec Decision 5, T7). `start({ env, port: 0 })` —
 * `src/server.ts` — is the SAME function `src/index.ts` calls for production and that Playwright's
 * `CODM_ENV=e2e` calls for e2e; only the COLUMN differs here (`integration` by default, `e2e` when
 * the caller asks for co-tenant services — see `IntegrationBackendOptions.services`), and `start`
 * itself is untouched by this shell. Nothing here re-enacts the migrate→import→mount
 * choreography the deleted `tests/support/integration-server.ts` used to hand-roll (its own
 * docblock confessed each divergence one by one — see git history if the reasoning is ever needed
 * again). What remains is genuinely test-only: one backend cached per `bun test` process, `reset()`
 * (truncate between tests), and the duck-typed `asTestBed()` adapter the `givenX` helpers below
 * (and any suite calling them directly) consume.
 *
 * Public types are DERIVED — from the CONTRACT, not the implementation (spec Decision 9 fallback:
 * `dts-bundle-generator` choked on this repo's extensionless-import + `moduleResolution: "bundler"`
 * convention — see `../../testing.d.ts`'s docblock for the full verdict). `../../testing.d.ts` is
 * hand-written and COMMITTED; the `satisfies TestingSurface` check at the bottom of this file is
 * the freshness gate — this module's actual exports must stay assignable to that committed
 * contract, or backend `tsc` fails right there. A consumer (the react harness, T8) imports types
 * from `@codm/api-typescript/testing` and never redeclares this shape locally.
 */

export interface IntegrationBackend {
	url: string
	container: RunningServer['container']
	asTestBed(): TestBedLike
	reset(): Promise<void>
	stop(): Promise<void>
	/** Base URLs of the co-tenant services this backend booted, keyed by workspace id. Empty on the
	 *  default path — the shape stays the same either way, so a consumer never branches on presence. */
	services: Readonly<Partial<Record<TestBootWorkspaceId, string>>>
	/** O dono sob o qual este boot semeia — declarado nas options ou carimbado pela `CloudSession`
	 *  montada. Exposto porque givens que falam com um co-tenant por HTTP (`givenConnectedGatewayChannel`)
	 *  precisam do mesmo dono no header `X-Owner-Id`, e a alternativa era importarem a constante do
	 *  produto (F3/T3). */
	ownerId: string
}

export interface IntegrationBackendOptions {
	ownerId?: string
	/**
	 * QUEM RESPONDE "quem é o operador" — declarado pelo chamador, porque a coluna sozinha não sabe
	 * distinguir os dois consumidores que a usam (F7).
	 *
	 * Sob `services` a coluna é `e2e`, e ela liga a `CloudSession` REAL. Aquela ligação foi declarada
	 * para o Playwright, com razão escrita em `shared/registry.ts`: *"o harness sobe o próprio portão
	 * de login do daemon (…) declarado porque a cadeia herdaria MockCloudSession e removeria em
	 * silêncio o portão que o e2e existe para exercitar"*. Verdade — para AQUELE consumidor.
	 *
	 * Mas há um SEGUNDO consumidor da mesma coluna: o harness de COMPONENTE do react
	 * (`packages/app/react/tests/support/integration-harness.ts`), que precisa da infraestrutura
	 * cross-process (o gateway Go sobre o mesmo arquivo SQLite) e NÃO tem mandato de login nenhum.
	 * Medido: as quatro suítes `.services.test.tsx` não mencionam login, auth nem CloudSession uma
	 * única vez — elas asseram o que a tela renderiza dado um estado de backend. Herdando o portão
	 * real, elas exigiriam um daemon de nuvem, um handshake e um token para provar que um canal
	 * pareado some da checklist.
	 *
	 * É a MESMA espécie do `e2e: PgDriver` que esta frente já corrigiu: uma declaração certa para um
	 * consumidor, herdada por outro que ela nunca considerou. A cura é a mesma — não mudar a coluna
	 * (o Playwright continua com o portão real, e agora o exercita de verdade), e sim deixar o
	 * consumidor DIZER o que precisa. Ausente, vale o que a coluna diz.
	 */
	identity?: 'column' | 'double'
	/**
	 * Workspaces to boot as co-tenant subprocesses over the SAME database file (spec D9/AC-6). Ids
	 * come from the manifest, and only workspaces that DECLARE a `testBoot` recipe are nameable —
	 * `template.config.ts` derives the type from the recipes themselves.
	 *
	 * SERVICES MODE IS THE E2E TOPOLOGY, and that is a DECLARATION, not a shortcut: with services
	 * the TS side boots the `e2e` column rather than `integration`, because the `e2e` column is
	 * where cross-process already lives (`src/shared/registry.ts`, landed in 52ebc462) —
	 * `FileLibsqlDriver` (the file at `CODM_DATA_DIR`, which is what a second process can open at
	 * all), `SqlExternalMediator` (the shared-outbox lanes; `integration`'s in-process
	 * `EventEmitter2Mediator` has no poller, so every integration event the gateway wrote would sit
	 * in the table forever), and `E2eAgentRunnerFactory` (deterministic, spawns no provider CLI).
	 * Booting `integration` with a second process attached would be a topology that exists nowhere.
	 */
	services?: readonly TestBootWorkspaceId[]
}

/**
 * Atalho de leitura sobre o container raiz deste shell.
 *
 * Até 2026-08-14 este era um `resolveToken<T>(token: unknown): T` com um cast e o comentário "one
 * cast, here, so no call site below needs its own" — ou seja, a MESMA cura que `core/src/injection`
 * dá, escrita uma segunda vez porque o módulo não existia nesta árvore. Agora ele só amarra o
 * container: o token continua tipado, e a conversão mora num lugar só na árvore inteira.
 */
const resolveToken = <T>(token: Token<T>): T => resolve(container, token)

/**
 * O dono que a `CloudSession` LIGADA carimba, ou `undefined` se ela não souber dizer.
 *
 * Isto substitui um fallback para a constante de dono do dobro de teste, que mora em `src/shared/`
 * (`services/CloudSession/MockCloudSession`) — ou seja: o
 * maquinário portável alcançando dentro da FONTE DO PRODUTO para descobrir quem ele é (F3/T3).
 * Perguntar à sessão deriva o valor em vez de redeclará-lo, e mantém semente e leitura de acordo por
 * construção mesmo se o produto trocar a implementação ligada.
 *
 * As TRÊS formas de "não sei" colapsam num `undefined` só, porque para o chamador elas são a mesma
 * coisa — falta uma declaração: sem sessão (`null`), sessão sem dono (`ownerId: null`, estado real
 * do ADR 0001: logado, ainda sem tenant), ou a sessão lançando (`FileCloudSession` sem credencial em
 * cache, que é o caso normal sob a coluna `e2e`). O `catch` é estreito de propósito: o valor só
 * alimenta um DEFAULT, e quem depende de identidade de verdade recebe o erro explícito acima em vez
 * de um dono inventado.
 */
async function stampedOwnerId(): Promise<string | undefined> {
	try {
		return (await resolveToken(CloudSession).identity())?.session.ownerId ?? undefined
	} catch {
		return undefined
	}
}

let booted: IntegrationBackend | null = null
let booting: Promise<IntegrationBackend> | null = null

export async function startIntegrationBackend(options?: IntegrationBackendOptions): Promise<IntegrationBackend> {
	if (booted) {
		// ONE backend per process is not a cache policy, it is the truth: the axis column, the kernel
		// Config, and the DI root container are all process-global. So a later caller cannot be handed
		// a backend that lacks a service it asked for — a silent 404 against a gateway that was never
		// booted is exactly the failure mode this whole front exists to delete.
		const missing = (options?.services ?? []).filter(id => !(id in booted!.services))
		if (missing.length > 0) {
			throw new Error(
				`startIntegrationBackend: this process already booted without service(s) ${missing.join(', ')}. ` +
					`Services must be requested on the FIRST call in a process (the boot column and the kernel Config are process-global).`,
			)
		}
		return booted
	}
	if (!booting) booting = boot(options)
	booted = await booting
	booting = null
	return booted
}

async function boot(options?: IntegrationBackendOptions): Promise<IntegrationBackend> {
	const requested = options?.services ?? []
	const withServices = requested.length > 0

	if (withServices && Config.env.CODM_DATA_DIR !== HARNESS_DATA_DIR) {
		// The outcome of `./harnessDataDir`, checked rather than trusted: if the kernel froze its
		// config before that module ran, the `e2e` column's FileLibsqlDriver would open the OPERATOR'S
		// real data dir and the co-tenant subprocess a scratch one — two databases, and a test suite
		// writing into a live daemon's file. Fail here, legibly, instead.
		throw new Error(
			`startIntegrationBackend: CODM_DATA_DIR froze as '${Config.env.CODM_DATA_DIR}' instead of the harness scratch dir ` +
				`'${HARNESS_DATA_DIR}'. tests/support/harnessDataDir must be the FIRST import of tests/support/testing.ts.`,
		)
	}

	// FRESH, before anything opens the file. The scratch dir is named after this process's pid, and
	// pids are REUSED: a run killed hard (SIGKILL leaves no `stop()` behind, exactly like the e2e
	// runner's own scratch dir) leaves a populated dir that a future process with the same pid would
	// otherwise inherit as its starting state — old rows, presented as a clean boot.
	if (withServices) rmSync(HARNESS_DATA_DIR, { recursive: true, force: true })

	// Column: `integration` on the default path (unchanged), `e2e` with services — see
	// IntegrationBackendOptions.services for why the topology decides the column.
	//
	// RESTORED AFTERWARDS, because the column is PROCESS-GLOBAL and this harness shares a process
	// with every other suite. `start()` calls `setBoundedContextEnvironment`, and nothing used to
	// put it back: the first suite here to boot left `integration` (or `e2e`) selected for the rest
	// of the run, and `BoundedContext.environment.test.ts`'s "o default é real" then read whatever
	// that suite had left. It only ever passed by luck of file order — the order that happens to
	// hold on macOS and not on Windows, which is how this surfaced.
	//
	// Restoring is unobservable, and that is checkable rather than hopeful: the only reader of the
	// selection is `byEnvironment`, every one of its call sites is a module-top-level `const` /
	// `export default` in a `*/controllers/index.ts`, and ES modules evaluate once. The columns are
	// therefore already frozen by the time `start()` returns — putting the variable back cannot
	// reach them.
	const environmentBeforeBoot = getBoundedContextEnvironment()
	const server = await start({ env: withServices ? 'e2e' : 'integration', port: 0 })
	setBoundedContextEnvironment(environmentBeforeBoot)

	// A IDENTIDADE, se o chamador a declarou — ver `IntegrationBackendOptions.identity`.
	//
	// Depois do `start()` e antes de qualquer request: o `CloudSessionMiddleware` resolve o token no
	// container RAIZ a cada chamada, então trocar o binding aqui alcança todo controller sem que
	// nenhum deles saiba. Antes do `start()` não daria — o binding é aplicado pela composição.
	if (options?.identity === 'double') {
		container.registerInstance(CloudSession as never, new MockCloudSession() as never)
	}

	const driver = resolveToken<LibSqlDatabaseDriver>(LibSqlDatabaseDriver)

	const running: RunningService[] = []
	for (const id of requested) {
		const service = await bootService(id, { dataDir: HARNESS_DATA_DIR })
		// One line per service, per process. The first opted-in suite in a process pays a build; the
		// rest pay a spawn — printing both is what keeps that from reading as an unexplained stall.
		console.log(
			`[harness] ${service.id} ready on ${service.url} (build ${service.buildMs.toFixed(0)}ms, spawn→health ${service.readyMs.toFixed(0)}ms)`,
		)
		running.push(service)
	}
	const services = Object.fromEntries(running.map(service => [service.id, service.url])) as Partial<Record<TestBootWorkspaceId, string>>
	// O dono semeado tem que ser o MESMO que o `CloudSessionMiddleware` carimba em cada request, ou os
	// givens escrevem num tenant e o caso sob teste lê de outro. Isto importava
	// a constante do dono de teste direto de `src/shared/` — ou seja: o maquinário
	// portável alcançando dentro da FONTE DO PRODUTO para saber quem ele é (F3/T3).
	//
	// Agora ele PERGUNTA. A `CloudSession` que este boot acabou de montar é a autoridade sobre a
	// identidade da sessão; ler o carimbo dela derivar o valor em vez de redeclará-lo, e o acordo
	// entre semente e leitura passa a valer por construção — inclusive se o produto trocar a
	// implementação ligada. Um harness portável não pode conhecer a constante de nenhum produto.
	// A declaração do chamador GANHA e é consultada primeiro — a sessão só é perguntada quando ninguém
	// disse quem é o dono. A ordem importa: sob `services` a coluna é `e2e`, que liga `FileCloudSession`,
	// e essa implementação LANÇA quando não há credencial em cache. Perguntar antes de olhar as options
	// faria um caller que declarou tudo direito explodir por causa de uma sessão que ele nem usa.
	// A sessão é SEMPRE consultada, mesmo quando o chamador declarou — e essa é a diferença entre
	// esta versão e a anterior, que fazia `options?.ownerId ?? await stampedOwnerId()`.
	//
	// O `??` curto-circuitava: declarar um `ownerId` significava que a sessão NUNCA era perguntada, e
	// portanto que ninguém comparava o que o teste SEMEIA com o que o middleware CARIMBA. A auditoria
	// do harness (.specs/2026-08-18-test-harness-normative-map.md, armadilha T1) mediu o custo: as
	// asserções POSITIVAS ficam vermelhas alto, mas as NEGATIVAS e de estado-vazio ficam VERDES PARA
	// SEMPRE — semeia sob `tenant-a`, lê sob o dono carimbado, não encontra nada, e `not.toContain(...)`
	// passa mesmo que a projeção nunca tenha sido escrita ou o endpoint tenha sumido.
	//
	// Chamar `stampedOwnerId()` aqui é seguro, e o comentário acima que argumentava o contrário estava
	// errado: ela tem `try/catch` e devolve `undefined` quando a sessão não sabe responder. O que a
	// ordem original protegia era o caller que declara tudo certo sob uma sessão que ele não usa — e
	// isso continua protegido, porque a declaração ainda ganha; a sessão só passou a ser AUDITADA.
	const stamped = await stampedOwnerId()
	const ownerId = options?.ownerId ?? stamped
	if (ownerId === undefined) {
		throw new Error(
			'startIntegrationBackend: nenhum `ownerId` foi declarado e a `CloudSession` montada não soube dizer qual é ' +
				'(sem sessão, sem dono na sessão, ou credencial ausente). Passe `ownerId` nas options (F3/T3).',
		)
	}
	if (options?.ownerId !== undefined && stamped !== undefined && options.ownerId !== stamped) {
		throw new Error(
			`startIntegrationBackend: o \`ownerId\` declarado (${options.ownerId}) não é o que a CloudSession ` +
				`montada carimba (${stamped}). O harness semearia sob um dono e o middleware leria sob outro — ` +
				`as asserções positivas ficariam vermelhas e as NEGATIVAS ficariam verdes para sempre. ` +
				`Declare o mesmo dono, ou passe \`identity: 'double'\` se a intenção é trocar a sessão.`,
		)
	}

	return {
		url: server.url,
		container: server.container,
		services,
		ownerId,
		asTestBed: () => ({ resolve: resolveToken, ownerId }),
		reset: () => driver.reset(),
		stop: async () => {
			// Co-tenants first: they write to the same file the next step closes.
			for (const service of running) await service.stop()
			await server.stop()
			// Only what services mode created — the default path never touched this dir.
			//
			// Deferred when the OS still holds the file: the store this dir contains is opened by the
			// TS driver too, and `@libsql/client` does not hand a SQLite file back on close under
			// Windows (measured — see `removeTempDirWhenFree`). A plain `rmSync` threw EBUSY there and
			// took the whole suite down at teardown, after its assertions had passed.
			if (withServices) removeTempDirWhenFree(HARNESS_DATA_DIR)
			booted = null
		},
	}
}

// THE COMPLETE CATALOG (spec Decision 8) — the bare `givenX` helpers, never the deprecated
// `createGivenHelpers` facade (TST-18; it does not enter this public surface). Every given in
// `./given` already declares its `testBed` parameter as `TestBedLike` at the SOURCE (interface
// segregation, not a boundary bridge — see `./given/types.ts`), so these are PLAIN re-exports: no
// wrapper, no cast. `asTestBed()` above hands out exactly `TestBedLike`, and a `TestBed` instance
// (the suites that still pass the concrete class) satisfies it structurally for free.
export {
	givenUser,
	givenAccount,
	givenUserWithAccount,
	givenActiveSession,
	givenOwner,
	givenOwnerWithResponsible,
	givenWorkspace,
	givenThread,
	GIVEN_MENTION_TAG,
	givenChannel,
	givenConnectedGatewayChannel,
	givenRemote,
	givenRemoteMembership,
	givenIssue,
	givenStop,
	givenDomainEvent,
	givenUserProfile,
} from './given'

/**
 * THE FRESHNESS GATE (spec Decision 9 fallback — see `../../testing.d.ts`'s docblock for why this
 * exists instead of a generate-and-byte-compare script). Every export this module hands out for
 * `@codm/api-typescript/testing` must stay assignable to the COMMITTED, hand-written contract — if
 * a given's signature drifts (a param renamed, an override added, a return field dropped) without
 * `testing.d.ts` being updated to match, this line is exactly where backend `tsc` turns red.
 */
const _testingSurface = {
	startIntegrationBackend,
	givenUser,
	givenAccount,
	givenUserWithAccount,
	givenActiveSession,
	givenOwner,
	givenOwnerWithResponsible,
	givenWorkspace,
	GIVEN_MENTION_TAG,
	givenThread,
	givenChannel,
	givenConnectedGatewayChannel,
	givenRemote,
	givenRemoteMembership,
	givenIssue,
	givenStop,
	givenDomainEvent,
	givenUserProfile,
} satisfies TestingSurface
void _testingSurface
