import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { revokeDevice } from '@codm/client-typescript/typescript'
import { IconLogout } from '@tabler/icons-react'
import { toast } from 'sonner'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Config } from '@/lib/config'
import { CLOUD_DEVICE_TOKEN_SECRET_KEY, useSecrets } from '@/services'
import { useCloudSessionStore } from '@/stores'

interface CloudAccountSectionProps extends ComponentProps<'div'> {}

/**
 * Logout (SP2 spec Decision 4, AC-6): "logout revoga o token no cloud e limpa o keychain; o app
 * volta ao estado da AC-3." Uses `revokeDevice` as a PLAIN SDK function (not the generated
 * `useRevokeDevice` hook) — the hook bakes `client.headers` in at the point `useRevokeDevice(...)`
 * is CALLED (render time), but the Bearer token here is only known once `secrets.get(...)`
 * resolves inside the mutation itself; the plain function form is the SDK's own sanctioned escape
 * hatch for exactly this "read a value, then call" shape (same functions the frozen SP2 SDK doc
 * lists as "client puro, sem React").
 */
export function CloudAccountSection({ className, ...props }: CloudAccountSectionProps) {
	const { t } = useTranslation()
	const secrets = useSecrets()
	const setUnauthenticated = useCloudSessionStore(s => s.setUnauthenticated)

	const logout = useMutation({
		mutationFn: async () => {
			const token = await secrets.get(CLOUD_DEVICE_TOKEN_SECRET_KEY)
			if (token) {
				// Best-effort remote revoke: a network hiccup must not trap the operator in a state where
				// they can't lock the console locally. The keychain delete below is what actually does that.
				await revokeDevice({ baseURL: Config.cloudUrl, headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined)
			}
			await secrets.delete(CLOUD_DEVICE_TOKEN_SECRET_KEY)
		},
		onSuccess: () => {
			setUnauthenticated()
			toast.success(t('cloudAuth.account.logoutSuccess'))
		},
	})

	return (
		// D3 doesn't picture this section (the group's screens skip straight from Perfil/Preferências
		// to Segurança) — kept regardless: revoking the cloud session is a safety capability the design
		// simply didn't model, not evidence to remove it (código vence). Restyled to the asymmetric-sm
		// radius the rest of this page's row cards use, for visual consistency with its neighbors —
		// `surface` itself (bg-background + hairline) already matches D3, unchanged from before.
		<Card className={cn('gap-0 rounded-asymmetric-sm p-0', className)} {...props}>
			<CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
				<div className="flex min-w-0 flex-col gap-0.5">
					<CardTitle className="text-sm font-semibold text-foreground">{t('cloudAuth.account.sectionTitle')}</CardTitle>
					<CardDescription className="text-xs">{t('cloudAuth.account.sectionDescription')}</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="flex items-center justify-end px-5 py-4">
				<Button variant="outline" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
					<IconLogout className="size-3.5" />
					{t('common.logout')}
				</Button>
			</CardContent>
		</Card>
	)
}
