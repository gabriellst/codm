import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconLogout } from '@tabler/icons-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@codm/app-ui/card'
import { Button } from '@codm/app-ui/button'
import { cn } from '@/lib/utils'
import { useCloudLogout } from '@/hooks'

interface CloudAccountSectionProps extends ComponentProps<'div'> {}

/**
 * Logout (SP2 spec Decision 4, AC-6): "logout revoga o token no cloud e limpa o keychain; o app
 * volta ao estado da AC-3." A mutation em si mora em `useCloudLogout` (`@/hooks`) — a Sidebar tem
 * seu próprio item "Sair" no rodapé que dispara a MESMA sequência signOut→limpar secret→redirect;
 * ver o docblock do hook para o histórico de por que o token é lido dentro da mutation.
 */
export function CloudAccountSection({ className, ...props }: CloudAccountSectionProps) {
	const { t } = useTranslation()
	const logout = useCloudLogout()

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
