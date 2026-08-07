import { useEffect } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { setCloudToken, useExchangeDeviceCode } from '@codm/client-typescript/typescript'
import { Config } from '@/lib/config'
import { extractErrorCode } from '@/lib/errors'
import { CLOUD_DEVICE_TOKEN_SECRET_KEY, useCloudSession, useSecrets } from '@/services'
import { useCloudSessionStore } from '@/stores'

/** Login step names — carried on every diagnostic log line so a future failure names WHERE it
 *  happened instead of just THAT it happened (the exact gap that made the 2026-08-07 login failure
 *  unrecoverable without a debugger on the failing machine): listener signature, code exchange,
 *  keychain write, or the best-effort daemon push. */
type LoginStep = 'listen' | 'exchange' | 'keychain' | 'daemon'

/**
 * `codm://auth?code=<uuid>` → the code, or `undefined` for anything this hook doesn't recognize
 * (malformed URL, wrong scheme, missing param) — an unrecognized deep link is ignored, never thrown.
 */
function extractDeviceCode(url: string): string | undefined {
	try {
		return new URL(url).searchParams.get('code') ?? undefined
	} catch {
		return undefined
	}
}

/**
 * Best-effort push of the freshly-exchanged token to the LOCAL daemon (`POST
 * /v1/session/cloud-token`, Task T7's `SetCloudToken` controller — the dispatcher gate reads its
 * own on-disk cache, populated by this call, never the cloud directly). `baseURL` is explicit and
 * points at `Config.baseUrl` (the LOCAL daemon) — the opposite of the exchange call above, which
 * explicitly targets `Config.cloudUrl`; this endpoint only ever exists on the machine's own daemon.
 * Tolerant on purpose — by the time this call is attempted the token is already safely in the
 * keychain, the actual source of truth (spec Decision 4); an offline daemon must never turn a
 * successful login into a visible error — hence no toast here, only a diagnostic trace (now that
 * `console.warn` actually lands somewhere, see LoggingService) for the case where the daemon really
 * was the problem.
 */
async function pushToDaemon(token: string): Promise<void> {
	try {
		await setCloudToken({ token }, { baseURL: Config.baseUrl })
	} catch (error) {
		const step: LoginStep = 'daemon'
		console.warn('[useDeepLinkAuth] daemon push failed (best-effort, tolerated — keychain already has the token)', {
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
	console.error(`[useDeepLinkAuth] login failed at step '${step}'`, {
		step,
		code: extractErrorCode(error),
		status: (error as { status?: number } | null)?.status,
		error,
	})
}

/**
 * Listens for the `codm://auth?code=…` deep link (SP2 spec Decisions 4/7) and drives the rest of
 * the device-code handshake: exchange (against the CLOUD origin, `Config.cloudUrl`) → keychain →
 * best-effort push to the local daemon → unlock (flips `useCloudSessionStore`).
 *
 * Mounted ONCE at the root (`routes/__root.tsx`), NOT inside `(app)`: the OS can hand the callback
 * back while the operator is on `/login` — i.e. exactly when `CloudSessionGate` has redirected away
 * and `(app)`'s own component tree is unmounted. A listener scoped to `(app)` would miss the one
 * event it exists to unblock. (File lives under `routes/(app)/-hooks/` by convention — this flow
 * conceptually belongs to unlocking the authenticated console — but the CALL SITE is the root.)
 */
export function useDeepLinkAuth(): void {
	const cloudSession = useCloudSession()
	const secrets = useSecrets()
	const setAuthenticated = useCloudSessionStore(s => s.setAuthenticated)
	const { mutateAsync: exchangeDeviceCode } = useExchangeDeviceCode({ client: { baseURL: Config.cloudUrl } })
	const { t } = useTranslation()

	useEffect(() => {
		let cancelled = false
		let unsubscribe: (() => void) | undefined
		// DUPLICATE DELIVERY (measured 2026-08-07): `TauriCloudSessionService.onAuthCallback` reads
		// BOTH `getCurrent()` (launch URLs) AND the live `onOpenUrl` listener — and with the app
		// already open, macOS delivers the SAME url through both at once, so `handleUrl` runs twice
		// for one login. Exchange is exactly-once BY DESIGN on the backend
		// (`DeviceTokenRepository.consumeCode` — a single atomic `UPDATE ... RETURNING`, spec
		// decision 4, and that is a property to preserve, not a bug to route around) — so the SECOND
		// delivery always fails DEVICE_CODE_INVALID even though the login already succeeded, and the
		// operator saw a failure toast for a login that worked. Dedupe by CODE, never by URL: the
		// code is the thing that is single-use, and a genuinely new login (new code) must never be
		// blocked by an old one.
		const processedCodes = new Set<string>()

		const handleUrl = (url: string) => {
			const code = extractDeviceCode(url)
			if (!code) return
			if (processedCodes.has(code)) return
			processedCodes.add(code)

			void (async () => {
				let step: LoginStep = 'exchange'
				try {
					const { token } = await exchangeDeviceCode({ data: { code } })
					if (cancelled) return
					step = 'keychain'
					await secrets.set(CLOUD_DEVICE_TOKEN_SECRET_KEY, token)
					await pushToDaemon(token)
					if (cancelled) return
					setAuthenticated()
					toast.success(t('cloudAuth.login.success'))
				} catch (error) {
					// Um código inválido/expirado/já consumido não pode derrubar o console — mas TAMBÉM
					// não pode sumir em silêncio, que é o que acontecia: a tela ficava no login sem uma
					// palavra e não havia como saber se o link chegou, nem em qual etapa (medido em
					// 2026-08-07). O toast é o mínimo; a mensagem distingue expirado de falha genérica
					// porque a ação do usuário é diferente (entrar de novo vs tentar de novo) — e agora
					// essa distinção lê o CÓDIGO real do erro (a SDK anexa `.code`/`.status` ao Error
					// que lança), não um `String(error).includes(...)` que nunca batia com a mensagem
					// HTTP genérica.
					logLoginFailure(step, error)
					const expired = extractErrorCode(error) === 'DEVICE_CODE_INVALID'
					toast.error(t(expired ? 'cloudAuth.login.expired' : 'cloudAuth.login.failed'))
				}
			})()
		}

		void cloudSession
			.onAuthCallback(handleUrl)
			.then(fn => {
				// The subscription can resolve after teardown; drop it rather than leak a listener.
				if (cancelled) fn()
				else unsubscribe = fn
			})
			.catch((error: unknown) => {
				// Sem assinatura não há login possível — e o usuário precisa saber, em vez de clicar
				// em "entrar" para sempre.
				logLoginFailure('listen', error)
				toast.error(t('cloudAuth.login.failed'))
			})

		return () => {
			cancelled = true
			unsubscribe?.()
		}
	}, [cloudSession, secrets, exchangeDeviceCode, setAuthenticated, t])
}
