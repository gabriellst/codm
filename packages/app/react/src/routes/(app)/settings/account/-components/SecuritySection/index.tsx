import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useGetMyAccount } from '@codedm/client-typescript/typescript'
import { IconKey, IconTrash, IconShieldCheck } from '@tabler/icons-react'
import { toast } from 'sonner'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { LockIcon } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDialogStore } from '@/stores/useDialogStore'
import { useLocale } from '@/hooks'

import { ChangePasswordDialog } from './ChangePasswordDialog'

/**
 * SecuritySection — password management and account deletion.
 * ChangePasswordButton opens ChangePasswordDialog via useDialogStore.
 * DeleteAccountButton triggers a confirm dialog via useDialogStore.confirm().
 * NOTE: No deleteAccount SDK mutation exists yet; stub shows a toast.
 */
export function SecuritySection({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const locale = useLocale()
	const { data, isPending, isError } = useGetMyAccount()
	const { show, confirm } = useDialogStore()

	async function handleDeleteAccount() {
		const ok = await confirm({
			title: t('account.security.deleteAccount.confirmTitle'),
			description: t('account.security.deleteAccount.confirmDescription'),
			actionLabel: t('account.security.deleteAccount.confirmAction'),
			cancelLabel: t('account.security.deleteAccount.confirmCancel'),
			variant: 'destructive',
		})
		if (ok) {
			// NOTE: stub — no deleteAccount SDK mutation available yet.
			toast.info(t('account.security.deleteAccount.stub'))
		}
	}

	return (
		<Card className={cn('gap-0 p-0', className)} {...props}>
			<CardHeader className="flex flex-row items-center gap-3 border-b border-border/60 px-5 py-4">
				<span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary" aria-hidden>
					<LockIcon className="size-5 text-foreground" />
				</span>
				<div className="flex min-w-0 flex-col gap-0.5">
					<CardTitle className="text-sm font-semibold text-foreground">{t('account.security.sectionTitle')}</CardTitle>
					<CardDescription className="text-xs">{t('account.security.sectionDescription')}</CardDescription>
				</div>
			</CardHeader>

			<CardContent className="flex flex-col gap-4 px-5 py-6">
				{isPending ? (
					<>
						<Skeleton className="h-10 w-48 rounded-lg" />
						<Skeleton className="h-px w-full" />
						<Skeleton className="h-10 w-40 rounded-lg" />
					</>
				) : isError || !data ? (
					<p className="text-sm text-muted-foreground">{t('account.security.loadError')}</p>
				) : (
					<>
						{/* Two-factor status (read-only display) */}
						<div className="flex items-center gap-2 text-sm">
							<IconShieldCheck className={cn('size-4', data.security.twoFactorEnabled ? 'text-success' : 'text-muted-foreground')} />
							<span className={cn('font-medium', data.security.twoFactorEnabled ? 'text-success' : 'text-muted-foreground')}>
								{data.security.twoFactorEnabled ? t('account.security.twoFactor.enabled') : t('account.security.twoFactor.disabled')}
							</span>
						</div>

						{/* Last password change */}
						{data.security.lastPasswordChangeAt ? (
							<p className="text-xs text-muted-foreground">
								{t('account.security.lastPasswordChange', {
									date: new Intl.DateTimeFormat(locale, {
										year: 'numeric',
										month: 'short',
										day: 'numeric',
									}).format(new Date(data.security.lastPasswordChangeAt)),
								})}
							</p>
						) : null}

						<div className="border-t border-border/60" />

						{/* Change password button — only shown if account has a password */}
						{data.security.hasPassword ? (
							<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
								<div className="flex flex-col gap-0.5">
									<span className="text-sm font-medium text-foreground">{t('account.security.changePassword.label')}</span>
									<span className="text-xs text-muted-foreground">{t('account.security.changePassword.description')}</span>
								</div>
								<Button variant="secondary" size="sm" onClick={() => show(<ChangePasswordDialog />)}>
									<IconKey className="size-3.5" />
									{t('account.security.changePassword.button')}
								</Button>
							</div>
						) : null}

						<div className="border-t border-border/60" />

						{/* Delete account */}
						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<div className="flex flex-col gap-0.5">
								<span className="text-sm font-medium text-destructive">{t('account.security.deleteAccount.label')}</span>
								<span className="text-xs text-muted-foreground">{t('account.security.deleteAccount.description')}</span>
							</div>
							<Button variant="destructive" size="sm" onClick={handleDeleteAccount}>
								<IconTrash className="size-3.5" />
								{t('account.security.deleteAccount.button')}
							</Button>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	)
}
