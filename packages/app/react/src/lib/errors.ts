import { toast } from 'sonner'
import { ERROR_CODES } from '@codm/client-typescript/errors'
import { useCloudSessionStore, useOnboardingStore } from '@/stores'
import i18n from './i18n'

// Frontend-only error codes that no backend emits.
const frontendErrorsEnum = {
	NETWORK_ERROR: 'NETWORK_ERROR',
	UNKNOWN_ERROR: 'UNKNOWN_ERROR',
	SESSION_EXPIRED: 'SESSION_EXPIRED',
} as const

// Closed set of known error codes — the CROSS-BACKEND union (openapi x-error-codes of every
// service, generated at @codm/client-typescript/errors — the same union the locales gate
// checks) + the frontend-only codes. Anything else is treated as a free-form message (e.g. an
// already-translated zod default) and rendered as-is. NEVER the per-service ApiErrorsEnum: that
// blinds the console to every other backend's vocabulary.
export const errorsEnum = {
	...(Object.fromEntries(ERROR_CODES.map(code => [code, code])) as { [K in (typeof ERROR_CODES)[number]]: K }),
	...frontendErrorsEnum,
} as const

export type ErrorCode = (typeof errorsEnum)[keyof typeof errorsEnum]

export function getErrorTranslation(code: ErrorCode): string {
	const t = i18n.getFixedT(i18n.language, 'translation') as (key: string) => string
	return t(`errors.${code}`) || code
}

export const errorTranslations: Record<ErrorCode, string> = new Proxy({} as Record<ErrorCode, string>, {
	get: (_, prop: string) => {
		if (prop in errorsEnum) {
			return getErrorTranslation(prop as ErrorCode)
		}
		return undefined
	},
})

export interface ErrorContext {
	code: ErrorCode
	message?: string
	originalError?: unknown
}

export type ErrorHandler = (ctx: ErrorContext) => void

const defaultErrorHandler: ErrorHandler = ctx => {
	const t = i18n.getFixedT(i18n.language, 'translation')
	const translatedMessage = getErrorTranslation(ctx.code) || ctx.message || getErrorTranslation('UNKNOWN_ERROR')
	toast.error(t('common.errorTitle'), {
		// ONE NOTIFICATION PER CAUSE. Both caches in `router.tsx` call this per failing query, so a
		// single dead backend arrives here once for every request in flight — and the operator got a
		// stack of identical red cards describing one fact. `sonner` collapses by `id`, and the cause
		// IS the code: title and description are both derived from it, so two toasts sharing a code
		// are the same toast by construction. Keyed rather than counted on purpose — the second
		// failure REPLACES the first instead of queueing behind it, so the card stays current.
		id: `error:${ctx.code}`,
		description: translatedMessage,
	})
}

/**
 * INFRASTRUCTURE FAILURE IS NOT A TOAST — it is a state, and the console already paints it.
 *
 * A toast answers "what happened to the thing I just did". NETWORK_ERROR (the daemon is not
 * answering at all) and GATEWAY_UNAVAILABLE (the api answered, the channel gateway behind it did
 * not) answer a different question: "what is the state of the system I am sitting in". That state
 * has had a dedicated surface since the supervision work landed — `SupervisionBanner` for the
 * gateway, the shell's boot-error splash for the daemon — both fixed, both persistent, both correct
 * for a condition that lasts until someone restarts a process.
 *
 * Painting it twice is what produced the noise: a transient card that expires while the failure it
 * describes is still true, stacked once per in-flight query, next to a banner already telling the
 * same story better. Two surfaces for one fact is not redundancy — it is the operator learning to
 * dismiss without reading.
 *
 * Suppressed, NOT swallowed: it goes to `console.warn`, so a failure never disappears without a
 * trace and a misclassification here stays visible to whoever is debugging instead of going silent.
 */
const infrastructureErrorHandler: ErrorHandler = ctx => {
	console.warn(
		`[errors] ${ctx.code}: infrastructure failure — no toast (the supervision banner / boot splash owns this state)`,
		ctx.originalError ?? ctx.message,
	)
}

/**
 * SESSÃO MORTA → A TELA DE LOGIN. E o caminho até lá é o que vale ler.
 *
 * O `CloudSessionGate` (`components/console/`, envolve o Outlet de `(app)`) JÁ é o dono da decisão
 * "para onde vai um operador sem sessão": ele renderiza `<Navigate to="/login" replace />` quando o
 * store diz `unauthenticated`. Este handler não navega — ele diz a VERDADE ao store, e o
 * redirecionamento acontece pelo mecanismo que já existia.
 *
 * ── por que NÃO importar o router, que é como o repo de referência faz ───────────────────────────
 * No fork de origem o `router.ts` é um módulo deliberadamente livre de efeito colateral que exporta um
 * SINGLETON, e por isso `lib/errors` pode importá-lo e chamar `router.navigate({ to: ... })` — o
 * docblock de lá explica que o ciclo resultante é benigno exatamente por causa dessa ausência de
 * efeito.
 *
 * Aqui nenhuma das duas premissas vale. O `router.tsx` deste app roda `configureZod()` e
 * `configureClient(...)` no escopo do módulo, e exporta uma FÁBRICA (`getRouter()`), não um
 * singleton — porque este console é `@tanstack/react-start`, onde quem constrói o router é o
 * framework. Copiar a forma de lá criaria um ciclo sobre um módulo COM efeito de init, que é
 * precisamente o caso que o docblock do fork de origem exclui.
 *
 * Então a regra porta e a forma não: em vez de um segundo mecanismo de navegação, uma segunda
 * ESCRITA na fonte de verdade que o primeiro já lê.
 *
 * ── e por que o toast continua ───────────────────────────────────────────────────────────────────
 * O gate redireciona em silêncio quando o operador ABRE o console sem token — ali o silêncio está
 * certo, nada aconteceu. Aqui aconteceu: ele estava trabalhando e uma chamada voltou 401. Trocar a
 * tela sem dizer por quê é a diferença entre "o app me levou ao login" e "o app piscou". O
 * `defaultErrorHandler` já colapsa por código, então as N queries que falharem juntas dão UM card.
 *
 * ── a corrida, declarada em vez de escondida ─────────────────────────────────────────────────────
 * O efeito do gate lê o keychain no mount e pode chamar `setAuthenticated()` DEPOIS de um 401 vindo
 * de um componente que vive fora do gate (a chrome — `AgentsRunningPill` é um). Nesse caso o
 * operador volta para dentro por um instante. Converge sozinho: toda query em voo devolve 401 e
 * cada uma re-executa este handler, então o estado estável é `unauthenticated`. Um token que o
 * keychain tem e o daemon recusa é uma sessão morta — a evidência do 401 é mais forte que a da
 * existência do token, e é por isso que a última escrita ser esta é o desfecho correto.
 */
const sessionEndedHandler: ErrorHandler = ctx => {
	useCloudSessionStore.getState().setUnauthenticated()
	defaultErrorHandler(ctx)
}

/**
 * "Conclua o onboarding" é um ESTADO, e um estado precisa levar a algum lugar — não também um toast.
 *
 * Sem a escrita no store, o backend recusava a rota e o operador ficava numa tela que não o levava
 * ao onboarding — porque o `OnboardingGate` decide pelo `completedAt` de uma LEITURA que, naquele
 * momento, também estava sendo recusada (`data` indefinido → o gate renderiza o app).
 *
 * Escreve no STORE e deixa o gate navegar, pela mesma razão do `sessionEndedHandler`: navegar aqui
 * seria um SEGUNDO mecanismo para a mesma decisão, e no dia em que os dois discordassem ninguém
 * saberia qual manda.
 *
 * SEM TOAST (2026-08-25, founder live-test, item 4). O REDIRECT já É a UX — "o app me levou para
 * completar o onboarding" —, e um card vermelho por cima é ruído duplicado da MESMA causa,
 * exatamente o raciocínio que `infrastructureErrorHandler` já aplica para NETWORK_ERROR/
 * GATEWAY_UNAVAILABLE (ver docblock dela). O sintoma reportado: o toast de `/dashboard`'s primeiro
 * render transitório (antes do próprio efeito de redirect do gate rodar) sobrevivia na tela mesmo
 * depois do operador já estar de volta em `/onboarding`. Suprimido, NÃO engolido — `console.warn`
 * mantém rastro pra quem depura.
 */
const onboardingRequiredHandler: ErrorHandler = ctx => {
	useOnboardingStore.getState().markRequired()
	console.warn(
		"[errors] ONBOARDING_NOT_COMPLETED: redirecting to /onboarding — no toast (OnboardingGate's navigate owns this state)",
		ctx.originalError ?? ctx.message,
	)
}

// Custom handlers for specific errors.
const customErrorHandlers: Partial<Record<ErrorCode, ErrorHandler>> = {
	NETWORK_ERROR: infrastructureErrorHandler,
	GATEWAY_UNAVAILABLE: infrastructureErrorHandler,
	// 401 do backend. `CloudSessionMiddleware` o levanta quando não há sessão de nuvem (ADR 0001),
	// que é a condição exata que a tela de login existe para resolver.
	UNAUTHORIZED: sessionEndedHandler,
	// O gêmeo só-frontend do de cima: mesma conclusão, mesmo destino.
	SESSION_EXPIRED: sessionEndedHandler,
	// "NÃO CONSEGUI NEM PERGUNTAR" leva ao MESMO lugar que "perguntei e a resposta foi não" (F7.6).
	//
	// O `FileCloudSession` levanta isto quando não há a quem perguntar quem é o operador. Não estava
	// mapeado, então caía no `defaultErrorHandler` — um toast — e NINGUÉM navegava. O efeito era o
	// defeito que a suíte e2e morta escondeu: o `OnboardingGate` decide pelo `completedAt` de uma
	// leitura que também foi recusada, `data` fica indefinido, e o `!data` dele RENDERIZA o console.
	// Ou seja, numa falha de identidade o operador via o shell do app sem que identidade nenhuma
	// tivesse sido verificada — exatamente o contrário do que o ADR 0001 promete por escrito
	// ("sem identidade o middleware RECUSA... não existe identidade de consolação").
	//
	// Consertado AQUI e não no gate, pela doutrina que o `onboardingRequiredHandler` logo abaixo já
	// fixou: o handler escreve no store, o gate navega. Um `if` de infra dentro do `OnboardingGate`
	// seria um SEGUNDO mecanismo decidindo a mesma coisa.
	CLOUD_UNREACHABLE: sessionEndedHandler,
	// Um portão de estado, não uma falha: o `OnboardingMiddleware` recusa até o operador concluir.
	ONBOARDING_NOT_COMPLETED: onboardingRequiredHandler,
}

export function handleError(code: ErrorCode | (string & {}), message?: string, originalError?: unknown): void {
	const errorCode = isValidErrorCode(code) ? code : 'UNKNOWN_ERROR'
	const ctx: ErrorContext = {
		code: errorCode,
		message,
		originalError,
	}

	const handler = customErrorHandlers[errorCode] || defaultErrorHandler
	handler(ctx)
}

// Type guard: only true for codes registered in errorsEnum.
export function isValidErrorCode(code: string): code is ErrorCode {
	return code in errorsEnum
}

/**
 * Translate a message that may either be:
 *   - a known error code (looked up under `errors.<code>`), or
 *   - a free-form string (e.g. an already-translated zod default), in which
 *     case it's returned verbatim.
 */
export function translateError(message: string | undefined | null): string {
	if (!message) return getErrorTranslation('UNKNOWN_ERROR')
	if (isValidErrorCode(message)) {
		return getErrorTranslation(message)
	}
	return message
}

/**
 * A REFUSED CONNECTION, RECOGNISED BY SHAPE — never by the wording of one engine.
 *
 * This used to read `error.message.includes('fetch')`, which is Chromium's phrasing ("Failed to
 * fetch"). The console ships inside a WKWebView (tauri on macOS), where the identical failure says
 * "Load failed" — no 'fetch' anywhere in it. So with both sidecars down, every query fell through to
 * UNKNOWN_ERROR and the operator was told "Erro desconhecido" about the one thing the app knew for
 * certain. Firefox has a third spelling again ("NetworkError when attempting to fetch resource").
 * Any message-substring test is a bet on which engine is running; the bet was already lost once.
 *
 * The shape is engine-independent and comes from the fetch spec: a request that never got an answer
 * rejects with a TypeError, and there is therefore no HTTP status attached. The status check is what
 * carries the weight — an error that carries a status ANSWERED, so whatever it is, it is not this;
 * the generated client's HTTP branch always sets `status` (and a `code`, read further up) on what it
 * throws, so that path is untouched by this.
 *
 * `name === 'TypeError'` as well as `instanceof`: an error that crossed a realm — webview to host,
 * worker to page, anything that re-serialized it — keeps its name and loses its prototype.
 *
 * TRADE-OFF, stated rather than hidden: a genuine programming TypeError raised inside a query
 * function also has no status, and is classified here as NETWORK_ERROR. That is deliberate — the
 * alternative is guessing at message strings again — and it is why the infrastructure handler warns
 * to the console instead of going quiet. The durable fix is upstream: the generated client should
 * tag its transport failures with a code the way it already tags HTTP ones, and then this heuristic
 * can go away entirely.
 */
function isTransportFailure(error: object): boolean {
	if ('status' in error && error.status != null) return false
	if (error instanceof TypeError) return true
	return 'name' in error && error.name === 'TypeError'
}

export function extractErrorCode(error: unknown): ErrorCode {
	if (error && typeof error === 'object') {
		if ('code' in error && typeof error.code === 'string' && isValidErrorCode(error.code)) {
			return error.code
		}
		if ('data' in error && error.data && typeof error.data === 'object') {
			const data = error.data as Record<string, unknown>
			if ('code' in data && typeof data.code === 'string' && isValidErrorCode(data.code)) {
				return data.code
			}
			if ('name' in data && typeof data.name === 'string' && isValidErrorCode(data.name)) {
				return data.name
			}
		}
		if ('name' in error && typeof error.name === 'string' && isValidErrorCode(error.name)) {
			return error.name
		}
		if (isTransportFailure(error)) {
			return 'NETWORK_ERROR'
		}
	}
	return 'UNKNOWN_ERROR'
}

export function handleApiError(error: unknown, fallbackMessage?: string): void {
	const code = extractErrorCode(error)
	const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : fallbackMessage
	handleError(code, message, error)
}

export function useErrorHandler() {
	return {
		handleError,
		handleApiError,
		extractErrorCode,
		isValidErrorCode,
		translateError,
		getErrorTranslation,
		errorTranslations,
	}
}
