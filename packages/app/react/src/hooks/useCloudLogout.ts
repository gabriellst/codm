import { useMutation } from '@tanstack/react-query'

import { auth } from '@/lib/auth'
import { CLOUD_DEVICE_TOKEN_SECRET_KEY, useSecrets } from '@/services'
import { useCloudSessionStore } from '@/stores'

/**
 * Logout (SP2 spec Decision 4, AC-6): "logout revoga o token no cloud e limpa o keychain; o app
 * volta ao estado da AC-3."
 *
 * Shared between `CloudAccountSection` (Minha Conta) and the Sidebar's rodapé "Sair" item — a
 * single mutation, never two copies of the signOut→limpar secret→setUnauthenticated sequence.
 * `useMutation` itself is per-caller (each `useCloudLogout()` call owns its own pending/error
 * state), which is exactly right: two triggers for the SAME operation, each showing its own
 * pending affordance without fighting over one shared boolean.
 *
 * ── quem revoga mudou; a forma da chamada, não ───────────────────────────────────────────────────
 * Isto chamava `revokeDevice`, uma rota nossa (`POST /cloud/devices/revoke`) que lia o header
 * `Bearer` à mão e marcava uma linha como revogada numa tabela nossa. A rota, a tabela e o use case
 * foram removidos: a credencial passou a ser a sessão do better-auth, e encerrar sessão é
 * `signOut` — dele. O que NÃO mudou é a razão de o token ser lido dentro da mutation em vez de no
 * corpo do componente: ele só existe depois que `secrets.get(...)` resolve, então o header tem de
 * ser montado na hora da chamada, e não no render. Por isso `fetchOptions`, e não um client fixado.
 */
export function useCloudLogout() {
	const secrets = useSecrets()
	const setUnauthenticated = useCloudSessionStore(s => s.setUnauthenticated)

	return useMutation({
		mutationFn: async () => {
			const token = await secrets.get(CLOUD_DEVICE_TOKEN_SECRET_KEY)
			if (token) {
				// Best-effort remote revoke: a network hiccup must not trap the operator in a state where
				// they can't lock the console locally. The keychain delete below is what actually does that.
				await auth.signOut({ fetchOptions: { headers: { Authorization: `Bearer ${token}` } } }).catch(() => undefined)
			}
			await secrets.delete(CLOUD_DEVICE_TOKEN_SECRET_KEY)
		},
		onSuccess: () => {
			setUnauthenticated()
		},
	})
}
