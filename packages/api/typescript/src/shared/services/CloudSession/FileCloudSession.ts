import { injectable } from 'tsyringe-neo'
import { join } from 'node:path'
import { readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { BaseError, Config, resolveDataDir } from '@codm/core-typescript'
import type { BaseInfrastructureErrors } from '@codm/core-typescript'
// A CLASSE `Client` DO SERVIÇO DE NUVEM, não a função solta e não o client local.
//
// Duas propriedades vêm dela e nenhuma vinha do import anterior. A primeira: ela carrega a
// `baseUrl` UMA vez, na construção, em vez de repetir `{ baseURL: Config.env.CODM_CLOUD_URL }` em
// cada chamada — um lugar para errar em vez de N. A segunda: o conjunto de métodos é o do
// DEPLOYMENT de nuvem, então falar com ele sobre uma rota que só existe no daemon local deixa de
// compilar. Enquanto havia uma superfície só, a mesma função servia para falar consigo mesmo e com
// a nuvem, e a fronteira era invisível na linha que a atravessa.
import { TypescriptCloudClient } from '@codm/client-typescript/typescript-cloud/Client'
import { SessionSchema, type Session } from '@shared/schemas'
import { CloudSession } from './CloudSession'

/**
 * O que sobrevive em disco: a CREDENCIAL, e nada sobre quem ela é.
 *
 * O campo `identity` foi removido — ver o docblock da porta. Ele guardava o `ownerId` que a nuvem
 * tinha dito, o que fazia do arquivo uma segunda autoridade sobre identidade por até uma hora.
 * `lastValidatedAt` foi junto: existia para medir a idade daquele cache, e não há mais cache cuja
 * idade importe.
 *
 * Exported so `CloudSession.test.ts` can type its fake's cache without redeclaring this shape.
 */
export interface CachedState {
	token?: string
	revoked: boolean
}

const EMPTY_STATE: CachedState = { revoked: false }
const CACHE_FILENAME = 'cloud-session.json'

/**
 * Por quanto tempo o veredito de `isEntitled()` vale sem perguntar de novo.
 *
 * O gate roda dentro do `drainLoop`, que faz poll entre 250ms e 2s. Sem esta janela seriam até
 * quatro requisições por segundo à nuvem, para sempre. Sessenta segundos é o teto de atraso com que
 * uma revogação para o trabalho de fundo — contra a UMA HORA do desenho anterior, e sem o arquivo
 * em disco que aquele exigia.
 */
const ENTITLEMENT_TTL_MS = 60 * 1000

/**
 * Por quanto tempo a IDENTIDADE resolvida vale sem perguntar de novo.
 *
 * Cinco segundos, e a razão é a forma do tráfego: carregar uma tela do console dispara uma rajada
 * de queries PARALELAS, e sem esta janela cada uma pagaria seu próprio round-trip à nuvem para
 * fazer a mesma pergunta sobre o mesmo token. A janela colapsa a rajada numa chamada.
 *
 * Cinco, e não sessenta como o gate de fundo, porque aqui há alguém olhando: é o teto de atraso com
 * que uma revogação fecha o console, e ninguém percebe cinco segundos. E cinco, e não uma hora como
 * o desenho anterior, que é a diferença entre uma janela de coalescência e uma segunda autoridade
 * sobre identidade — esta vive em MEMÓRIA, morre com o processo, e some no instante em que a nuvem
 * recusa a credencial.
 */
const IDENTITY_TTL_MS = 5 * 1000

/**
 * O `CloudSession` real — a credencial em `<CODM_DATA_DIR>/cloud-session.json` (0600), e toda
 * pergunta sobre ela respondida pela NUVEM. Bound `real`/`e2e` (`shared/registry.ts`);
 * `mock`/`integration` bindam `MockCloudSession` para que nenhum teste abra socket (regra de S2S)
 * nem toque um data dir de verdade.
 *
 * Construtor sem argumentos e `@injectable()` para que o registry possa bindá-lo por REFERÊNCIA DE
 * CLASSE (`real: FileCloudSession`) em vez de `useFactory` — é isso que o torna um SINGLETON de
 * verdade no tsyringe (`registerSingleton`, ver `core/types/Registry.ts`), e aqui isso importa
 * especificamente: `SetCloudTokenController` e `LibSqlMailboxDispatcher` precisam ler e escrever a
 * MESMA instância em memória, ou um login novo nunca chegaria ao gate do dispatcher sem reinício
 * (AC-3). Um binding por `useFactory` é TRANSIENTE (reconstruído a cada resolve — mesmo arquivo), o
 * que teria reintroduzido esse bug em silêncio.
 *
 * O estado é lido do disco PREGUIÇOSAMENTE (`getState()`), não no construtor: os pontos que tocam
 * SO e rede (`cachePath`/`fetchSession`/`isCloudConfigured`) são `protected` e sobrescritos por uma
 * subclasse de teste, e os campos que a subclasse atribui no próprio construtor ainda não existem
 * enquanto o `super()` roda — uma leitura ansiosa aqui os veria `undefined`.
 */
@injectable()
export class FileCloudSession extends CloudSession {
	private state: CachedState | undefined
	private client: TypescriptCloudClient | undefined
	private entitlement: { value: boolean; until: number } | undefined
	private resolved: { token: string; session: Session | null; until: number } | undefined
	private inFlight: { token: string; promise: Promise<Session | null> } | undefined

	setToken(token: string): void {
		this.state = { token, revoked: false }
		this.writeCache(this.state)
		// O veredito anterior falava de OUTRA credencial. Mantê-lo faria um login novo herdar o "não"
		// do token velho pelo resto da janela — e é exatamente no login que alguém está olhando.
		this.entitlement = undefined
		this.resolved = undefined
		this.inFlight = undefined
	}

	async identity(): Promise<Session | null> {
		// SEM NUVEM CONFIGURADA, NÃO HÁ A QUEM PERGUNTAR — e perguntar mesmo assim é pior que recusar.
		//
		// `Config.env.CODM_CLOUD_URL` não sabe dizer "ausente": ela recebe o valor de `API_URL` por
		// default cruzado. Sem esta guarda, um install sem a env manda o daemon perguntar A SI MESMO
		// `GET /session` — que não existe localmente, porque `auth` é cloud-only (PLACEMENT) — leva
		// 404, e 404 não é 401, então a falha propagava e virava 500 `INTERNAL_SERVER_ERROR`. Medido:
		// era exatamente o "Erro desconhecido" que o console mostrava em toda tela.
		if (!this.isCloudConfigured()) {
			throw new BaseError<BaseInfrastructureErrors>(
				'CLOUD_UNREACHABLE',
				'CODM_CLOUD_URL não está configurada — o daemon local não tem a quem perguntar quem é o operador. ' +
					'Declare-a no `.env` da raiz (veja `.env.example`) apontando para o deployment de nuvem.',
			)
		}

		const state = this.getState()
		if (state.revoked || !state.token) return null
		// Capturado numa const porque a narrowing de `state.token` não sobrevive à closure abaixo — e
		// um `!` a faria sobreviver mentindo.
		const token = state.token

		// A janela é chaveada PELO TOKEN, e não só pelo tempo: um login novo dentro dos cinco segundos
		// não pode herdar a resposta que a nuvem deu sobre a credencial anterior.
		const now = this.now()
		if (this.resolved && this.resolved.token === token && now < this.resolved.until) return this.resolved.session

		// E UMA CHAMADA EM VOO É COMPARTILHADA, não só uma já concluída.
		//
		// A janela acima sozinha não cobria o caso que motivou a janela: a rajada de queries de uma
		// tela sai em PARALELO, e as três perguntas partem antes de qualquer uma ter gravado a
		// resposta — então três round-trips idênticos saíam mesmo assim. Medido por teste, não
		// suposto. Quem chega durante uma pergunta em voo entra na mesma, exatamente como o
		// `drain()` do `LibSqlMailboxDispatcher` faz com o guarda `this.draining`.
		if (this.inFlight && this.inFlight.token === token) return this.inFlight.promise

		const promise = this.resolve(token)
			.then(session => {
				this.resolved = { token, session, until: this.now() + IDENTITY_TTL_MS }
				return session
			})
			.finally(() => {
				this.inFlight = undefined
			})
		this.inFlight = { token, promise }
		return promise
	}

	async isEntitled(): Promise<boolean> {
		// Dev-compat (spec T7.1 rollout note): um install sem CODM_CLOUD_URL no ambiente CRU nunca
		// gateia por login. `Config.env.CODM_CLOUD_URL` não sabe dizer "ausente" — ela recebe o valor
		// de API_URL por default cruzado (core/utils/Config.ts) e é SEMPRE uma string verdadeira, por
		// isso a leitura é do derivado `CLOUD_CONFIGURED`, computado antes daquele default.
		if (!this.isCloudConfigured()) return true

		const state = this.getState()
		if (state.revoked || !state.token) return false

		const now = this.now()
		if (this.entitlement && now < this.entitlement.until) return this.entitlement.value

		let value: boolean
		try {
			value = (await this.identity()) !== null
		} catch {
			// A rede caiu. Diferente do `identity()`, aqui NÃO se propaga: isto gateia trabalho de
			// fundo que já está na fila, e derrubá-lo por um soluço de rede trocaria uma falha de
			// conectividade por turnos perdidos. Vale o último veredito conhecido — e, se nunca houve
			// um, o silêncio conta como "não", que é a direção segura.
			return this.entitlement?.value ?? false
		}

		this.entitlement = { value, until: now + ENTITLEMENT_TTL_MS }
		return value
	}

	/**
	 * A pergunta única: "de quem é este token?", feita à nuvem.
	 *
	 * Um 401/403 é a nuvem dizendo que a credencial não vale — e aí o estado inteiro é zerado, para
	 * que a próxima pergunta nem saia da máquina. Qualquer outra falha PROPAGA: quem chama decide o
	 * que fazer com "não consegui perguntar", e as duas decisões são diferentes (ver `isEntitled`).
	 */
	private async resolve(token: string): Promise<Session | null> {
		try {
			return await this.fetchSession(token)
		} catch (error) {
			if (!isUnauthorized(error)) throw error
			this.state = { ...EMPTY_STATE, revoked: true }
			this.entitlement = { value: false, until: this.now() + ENTITLEMENT_TTL_MS }
			this.resolved = undefined
			this.deleteCache()
			return null
		}
	}

	/**
	 * `GET /session` na NUVEM, com a credencial do dispositivo. A ÚNICA chamada de rede desta
	 * classe, `protected` para que um teste a falseie sem abrir socket.
	 *
	 * PARSEADO pelo `SessionSchema`, nunca convertido. A resposta traz `expiresAt` como string (é
	 * JSON no fio) e o `Session` daqui a quer como `Date` — `z.coerce.date()` faz a travessia. Um
	 * `as unknown as Session` compilaria e faria o `expiresAt` ser uma string se dizendo `Date`, que
	 * é o tipo de mentira que só aparece no dia em que alguém chama `.getTime()`.
	 */
	protected async fetchSession(token: string): Promise<Session> {
		const response = await this.cloud().getSession({ headers: { Authorization: `Bearer ${token}` } })
		return SessionSchema.parse(response)
	}

	/** Construído sob demanda — ver a nota sobre ordem de inicialização no docblock da classe. */
	private cloud(): TypescriptCloudClient {
		this.client ??= TypescriptCloudClient.create({ baseUrl: Config.env.CODM_CLOUD_URL })
		return this.client
	}

	private getState(): CachedState {
		if (!this.state) this.state = this.readCache()
		return this.state
	}

	/**
	 * O relógio, atrás de uma costura — mesma razão que `cachePath` e `fetchSession` têm a sua: um
	 * teste das janelas de coalescência precisa ATRAVESSÁ-LAS, e a alternativa seria dormir cinco
	 * segundos de verdade em suíte. Um `sleep` num teste é uma aposta na máquina que o roda.
	 */
	protected now(): number {
		return Date.now()
	}

	/** Overridden in tests to avoid depending on which env `Config` happened to parse at import time. */
	protected isCloudConfigured(): boolean {
		return Config.env.CLOUD_CONFIGURED
	}

	/** `protected` so a test points the cache at a `mkdtempSync` scratch dir instead of the real one. */
	protected cachePath(): string {
		return join(resolveDataDir(Config.env.CODM_DATA_DIR), CACHE_FILENAME)
	}

	protected readCache(): CachedState {
		try {
			const raw = readFileSync(this.cachePath(), 'utf-8')
			const parsed = JSON.parse(raw) as Partial<CachedState>
			return { token: parsed.token, revoked: parsed.revoked ?? false }
		} catch {
			// Missing file (never logged in) or a corrupt one — either way, the safe default is "no
			// cached session", not a thrown error that would take the daemon down over a JSON typo.
			return { ...EMPTY_STATE }
		}
	}

	protected writeCache(state: CachedState): void {
		const path = this.cachePath()
		// `mode` on writeFileSync only applies when the file is CREATED — chmod explicitly afterward so
		// an existing file from a less careful prior write is tightened too, not just a fresh one.
		writeFileSync(path, JSON.stringify(state), { mode: 0o600 })
		chmodSync(path, 0o600)
	}

	protected deleteCache(): void {
		rmSync(this.cachePath(), { force: true })
	}
}

/** "A nuvem recusou esta credencial" — distinto de "não consegui perguntar". */
function isUnauthorized(error: unknown): boolean {
	const status = (error as { status?: unknown } | null)?.status
	return status === 401 || status === 403
}
