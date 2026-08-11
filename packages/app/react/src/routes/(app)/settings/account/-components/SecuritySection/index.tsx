import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useGetMyAccount } from '@codm/client-typescript/typescript'
import { toast } from 'sonner'

import { sectionLabel, surface } from '@/components/ui/surfaces'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDialogStore } from '@/stores/useDialogStore'

import { ChangePasswordDialog } from './ChangePasswordDialog'

/**
 * SecuritySection — D3 "Segurança" (jxl4Y, Minha Conta). Password management and account deletion,
 * each its own bordered row card (measured IS2DV/K0OcL) instead of one boxed Card.
 *
 * The two-factor status line and "last password change" timestamp are DROPPED here — the design's
 * Segurança section only budgets height for the two action rows below (measured: header 27 + body
 * 148 = exactly two rows, no room for a third line). The underlying data isn't gone (`useGetMyAccount`
 * still returns `security.twoFactorEnabled`/`lastPasswordChangeAt`); this is a pure display
 * simplification, not a capability removal.
 *
 * ChangePasswordButton opens ChangePasswordDialog via useDialogStore.
 * DeleteAccountButton triggers a confirm dialog via useDialogStore.confirm().
 * NOTE: No deleteAccount SDK mutation exists yet; stub shows a toast.
 */
export function SecuritySection({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
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
		<section className={cn('flex flex-col gap-3', className)} {...props}>
			<h2 className={sectionLabel}>{t('account.security.sectionTitle')}</h2>

			{isPending ? (
				<div className="flex flex-col gap-2.5">
					<Skeleton className="h-16 rounded-asymmetric-sm" />
					<Skeleton className="h-16 rounded-asymmetric-sm" />
				</div>
			) : isError || !data ? (
				<p className="text-sm text-muted-foreground">{t('account.security.loadError')}</p>
			) : (
				<div className="flex flex-col gap-2.5">
					{/* Change password row — only shown if account has a password */}
					{data.security.hasPassword ? (
						<div className={cn('flex flex-col gap-3 rounded-asymmetric-sm p-4 sm:flex-row sm:items-center sm:justify-between', surface)}>
							<div className="flex flex-col gap-1">
								<span className="text-sm font-bold text-foreground">{t('account.security.changePassword.label')}</span>
								<span className="text-sm text-muted-foreground">{t('account.security.changePassword.description')}</span>
							</div>
							{/* D3 (jxl4Y) — measured `ghost` (k5nLd: no fill, no stroke), not `outline` like the
							    equivalent trigger used to be. */}
							<Button variant="ghost" size="sm" onClick={() => show(<ChangePasswordDialog />)}>
								{t('account.security.changePassword.button')}
							</Button>
						</div>
					) : null}

					{/* Delete account row */}
					<div className={cn('flex flex-col gap-3 rounded-asymmetric-sm p-4 sm:flex-row sm:items-center sm:justify-between', surface)}>
						<div className="flex flex-col gap-1">
							<span className="text-sm font-bold text-foreground">{t('account.security.deleteAccount.label')}</span>
							<span className="text-sm text-muted-foreground">{t('account.security.deleteAccount.description')}</span>
						</div>
						<Button variant="destructive" size="sm" onClick={handleDeleteAccount}>
							{t('account.security.deleteAccount.button')}
						</Button>
					</div>
				</div>
			)}
		</section>
	)
}
