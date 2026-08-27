import { useEffect } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
// `setCloudToken` é do daemon LOCAL (o console empurra o token para a máquina); o resgate do código
// é da NUVEM, e agora vem do CLIENT DO BETTER-AUTH (`auth`, já apontado para `Config.cloudUrl`) em
// vez de um hook gerado. Dois destinos, dois clients — e antes do ADR 0001 os dois vinham do mesmo
// import, o que fazia a fronteira ser invisível na linha que a atravessa.
import { claimSignInCode, setCloudToken } from '@codm/client-typescript/typescript'
import { auth } from '@/lib/auth'
import { daemonBaseUrl } from '@/lib/config'
import { extractErrorCode } from '@/lib/errors'
import { CLOUD_DEVICE_TOKEN_SECRET_KEY, useSecrets } from '@/services'
import { useCloudSessionStore } from '@/stores'

/** Login step names — carried on every diagnostic log line so a future failure names WHERE it
 *  happened instead of just THAT it happened (the exact gap that made the 2026-08-07 login failure
 *  unrecoverable without a debugger on the failing machine): listener signature, code exchange,
 *  keychain write, or the best-effort daemon push. */
type LoginStep = 'claim' | 'exchange' | 'keychain' | 'daemon'

/**
 * Best-effort push of the freshly-exchanged token to the LOCAL daemon (`POST
 * /session/cloud-token`, Task T7's `SetCloudToken` controller — the dispatcher gate reads its
 * own on-disk cache, populated by this call, never the cloud directly). `baseURL` is explicit and
 * points at `daemonBaseUrl()` (the LOCAL daemon, na porta que o host RESOLVEU no boot — nunca o
 * `Config.baseUrl` assado no bundle) — o oposto da troca acima, que mira explicitamente
 * `Config.cloudUrl`; este endpoint só existe no daemon da própria máquina.
 * Tolerant on purpose — by the time this call is attempted the token is already safely in the
 * keychain, the actual source of truth (spec Decision 4); an offline daemon must never turn a
 * successful login into a visible error — hence no toast here, only a diagnostic trace (now that
 * `console.warn` actually lands somewhere, see LoggingService) for the case where the daemon really
 * was the problem.
 */
async function pushToDaemon(token: string): Promise<void> {
	try {
		await setCloudToken({ token }, { baseURL: daemonBaseUrl() })
	} catch (error) {
		const step: LoginStep = 'daemon'
		console.warn('[useLoopbackAuth] daemon push failed (best-effort, tolerated — keychain already has the token)', {
			step,
			code: extractErrorCode(error),
			status: (error as { status?: number } | null)?.status,
			error,
		})
	}
}

/**
 * The ONE place a login failure gets written down before the toast fires. `step` is what makes this
 * more than `console.error(error)`: the 2026-08-07 incident's actual cost was not the absence of a
 * log line, it was not knowing WHICH of listener-signature / code-exchange / keychain broke — three
 * causes with three different fixes, indistinguishable from "login failed" alone.
 */
function logLoginFailure(step: LoginStep, error: unknown): void {
	console.error(`[useLoopbackAuth] login failed at step '${step}'`, {
		step,
		code: extractErrorCode(error),
		status: (error as { status?: number } | null)?.status,
		error,
	})
}

/**
 * FECHA O LOGIN pelo LISTENER DE LOOPBACK (RFC 8252): reclama o código que o navegador do sistema
 * deixou no daemon local → troca por sessão na nuvem → keychain → empurra ao daemon → destrava o
 * console (`useCloudSessionStore`).
 *
 * ── por que um laço, e não um evento ─────────────────────────────────────────────────────────────
 * Isto escutava o deep link `codm://auth?code=…`. O deep link morreu por limitação de PLATAFORMA,
 * não de desenho: no macOS o roteamento de esquema exige um `.app` com o esquema no `Info.plist`, o
 * `tauri dev` não gera bundle nenhum, e o registro em runtime é recusado
 * (`tauri-plugin-deep-link`: *"macOS: Unsupported, will return UnsupportedPlatform"*). Medido em
 * 2026-08-15: os registrantes de `codm://` na máquina eram o app INSTALADO e um DMG montado — o
 * processo de dev não era candidato, e o login abria o app errado.
 *
 * O loopback não tem evento para assinar: o navegador faz um GET no daemon e vai embora. Alguém tem
 * de perguntar. O laço só existe enquanto a tela de login está aberta (a guarda de `status` o
 * encerra), bate em `127.0.0.1` e some assim que o código chega.
 *
 * ── a retirada é DESTRUTIVA, e é isso que dispensa a deduplicação ───────────────────────────────
 * A versão anterior mantinha um `Set` de códigos já vistos, porque o macOS entregava o MESMO deep
 * link duas vezes e a segunda tentativa falhava contra um token já consumido — o operador via um
 * toast de erro num login que funcionou. Aqui o `claim` do daemon esvazia a gaveta: o laço encontra
 * o código uma vez e as consultas seguintes voltam `null`. A propriedade que a dedupe garantia agora
 * é estrutural.
 *
 * Montado UMA vez na raiz (`routes/__root.tsx`), NÃO dentro de `(app)`: o operador está em `/login`
 * quando o código chega — exatamente quando a árvore de `(app)` está desmontada. Um laço com escopo
 * em `(app)` perderia o único evento que ele existe para capturar. (O arquivo vive em
 * `routes/(app)/-hooks/` por convenção — o fluxo pertence a destravar o console autenticado — mas o
 * CALL SITE é a raiz.)
 */
/**
 * De quanto em quanto tempo o console pergunta ao daemon se o código já chegou.
 *
 * Um segundo e meio é folgado de propósito: o laço só roda enquanto a tela de login está aberta, a
 * consulta é contra `127.0.0.1` (sem rede), e a espera real é o operador digitando a senha dele no
 * navegador — apertar o intervalo não encurta isso, só gasta ciclos.
 */
const CLAIM_INTERVAL_MS = 1_500

export function useLoopbackAuth(): void {
	const secrets = useSecrets()
	const status = useCloudSessionStore(s => s.status)
	const setAuthenticated = useCloudSessionStore(s => s.setAuthenticated)
	const { t } = useTranslation()

	useEffect(() => {
		// Já autenticado não tem o que reclamar. Sem esta guarda o laço rodaria para sempre, batendo
		// no daemon a cada 1,5s pelo resto da sessão para perguntar algo que já foi respondido.
		if (status === 'authenticated') return

		let cancelled = false

		const redeem = async (code: string): Promise<void> => {
			let step: LoginStep = 'exchange'
			try {
				// O client do better-auth NÃO lança: devolve `{ data, error }`. Normalizamos para
				// exceção aqui porque o resto deste bloco (o `step`, o log, o toast) existe para tratar
				// falha num lugar só — e um `if (error)` que seguisse adiante escreveria `undefined` na
				// keychain e declararia o login bem-sucedido.
				const { data, error } = await auth.oneTimeToken.verify({ token: code })
				if (error) throw error
				// A credencial guardada é o TOKEN DE SESSÃO do better-auth, que o plugin `bearer` aceita
				// em `Authorization: Bearer …`.
				const token = data?.session.token
				if (!token) throw new Error('one-time-token verify não devolveu sessão')
				if (cancelled) return
				step = 'keychain'
				await secrets.set(CLOUD_DEVICE_TOKEN_SECRET_KEY, token)
				await pushToDaemon(token)
				if (cancelled) return
				setAuthenticated()
			} catch (error) {
				// Um código inválido/expirado não pode derrubar o console — mas TAMBÉM não pode sumir em
				// silêncio, que é o que acontecia: a tela ficava no login sem uma palavra e não havia
				// como saber em qual etapa (medido em 2026-08-07).
				logLoginFailure(step, error)
				// Distingue por STATUS: o `verify` do better-auth responde 400 para as três formas de
				// "esse código não serve" (inválido, expirado, já consumido), que é exatamente a
				// fronteira que muda a ação do usuário — entrar de novo vs tentar de novo.
				const expired = (error as { status?: number } | null)?.status === 400
				toast.error(t(expired ? 'cloudAuth.login.expired' : 'cloudAuth.login.failed'))
			}
		}

		const tick = async (): Promise<void> => {
			try {
				// `baseURL` EXPLÍCITO no daemon local: o código foi entregue ao loopback DESTA máquina,
				// nunca à nuvem. É a mesma disciplina do `pushToDaemon` logo abaixo, e o oposto do
				// `auth.oneTimeToken.verify` acima, que fala com a nuvem.
				const { code } = await claimSignInCode({ baseURL: daemonBaseUrl() })
				if (cancelled || code === null) return
				await redeem(code)
			} catch (error) {
				// O daemon pode estar subindo, ou reiniciando. Isso NÃO é falha de login: o laço tenta de
				// novo em 1,5s, e gritar aqui encheria a tela de toasts durante um boot normal. Fica o
				// rastro, que é o que faltou em 2026-08-07.
				logLoginFailure('claim', error)
			}
		}

		const timer = setInterval(() => void tick(), CLAIM_INTERVAL_MS)
		// Uma primeira tentativa imediata: se o operador voltou ao app depois de já ter concluído no
		// navegador, o código está esperando e não há razão para ele olhar uma tela de login por mais
		// um intervalo.
		void tick()

		return () => {
			cancelled = true
			clearInterval(timer)
		}
	}, [secrets, status, setAuthenticated, t])
}
