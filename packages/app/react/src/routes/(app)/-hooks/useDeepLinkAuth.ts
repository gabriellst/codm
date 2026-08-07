import { useEffect } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { setCloudToken, useExchangeDeviceCode } from '@codm/client-typescript/typescript'
import { Config } from '@/lib/config'
import { CLOUD_DEVICE_TOKEN_SECRET_KEY, useCloudSession, useSecrets } from '@/services'
import { useCloudSessionStore } from '@/stores'

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
 * successful login into a visible error.
 */
async function pushToDaemon(token: string): Promise<void> {
	try {
		await setCloudToken({ token }, { baseURL: Config.baseUrl })
	} catch {
		// offline daemon — the keychain write already happened, nothing to undo.
	}
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

		const handleUrl = (url: string) => {
			const code = extractDeviceCode(url)
			if (!code) return

			void exchangeDeviceCode({ data: { code } })
				.then(async ({ token }) => {
					if (cancelled) return
					await secrets.set(CLOUD_DEVICE_TOKEN_SECRET_KEY, token)
					await pushToDaemon(token)
					if (cancelled) return
					setAuthenticated()
					toast.success(t('cloudAuth.login.success'))
				})
				.catch((error: unknown) => {
					// Um código inválido/expirado/já consumido não pode derrubar o console — mas TAMBÉM
					// não pode sumir em silêncio, que é o que acontecia: a tela ficava no login sem uma
					// palavra e não havia como saber se o link chegou (medido em 2026-08-07). O toast é
					// o mínimo; a mensagem distingue expirado de falha genérica porque a ação do
					// usuário é diferente (entrar de novo vs tentar de novo).
					const expired = String(error).includes('DEVICE_CODE_INVALID')
					toast.error(t(expired ? 'cloudAuth.login.expired' : 'cloudAuth.login.failed'))
				})
		}

		void cloudSession
			.onAuthCallback(handleUrl)
			.then(fn => {
				// The subscription can resolve after teardown; drop it rather than leak a listener.
				if (cancelled) fn()
				else unsubscribe = fn
			})
			.catch(() => {
				// Sem assinatura não há login possível — e o usuário precisa saber, em vez de clicar
				// em "entrar" para sempre.
				toast.error(t('cloudAuth.login.failed'))
			})

		return () => {
			cancelled = true
			unsubscribe?.()
		}
	}, [cloudSession, secrets, exchangeDeviceCode, setAuthenticated, t])
}
