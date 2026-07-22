import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useGetMyAccount } from '@template/client-typescript/typescript'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { GradientIconBadge } from '@/components/ui/gradient-icon-badge'
import { BellIcon } from '@/components/ui/icons'
import { cn } from '@/lib/utils'

import { PreferencesForm } from './PreferencesForm'

/**
 * PreferencesSection — owns the useGetMyAccount query and renders PreferencesForm once loaded.
 * The query is shared with ProfileFormSection via React Query deduplication.
 */
export function PreferencesSection({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const { data, isPending, isError } = useGetMyAccount()

	return (
		<Card className={cn('gap-0 p-0', className)} {...props}>
			<CardHeader className="flex flex-row items-center gap-3 border-b border-border/60 px-5 py-4">
				<GradientIconBadge icon={BellIcon} />
				<div className="flex min-w-0 flex-col gap-0.5">
					<CardTitle className="text-sm font-semibold text-foreground">{t('account.preferences.sectionTitle')}</CardTitle>
					<CardDescription className="text-xs">{t('account.preferences.sectionDescription')}</CardDescription>
				</div>
			</CardHeader>

			<CardContent className="px-5 py-6">
				{isPending ? (
					<div className="flex flex-col gap-4">
						<div className="grid gap-4 sm:grid-cols-2">
							{Array.from({ length: 3 }).map((_, i) => (
								<div key={i} className="flex flex-col gap-1.5">
									<Skeleton className="h-4 w-20 rounded" />
									<Skeleton className="h-8 w-full rounded-lg" />
								</div>
							))}
						</div>
						<Skeleton className="h-14 w-full rounded-xl" />
					</div>
				) : isError || !data ? (
					<p className="text-sm text-muted-foreground">{t('account.preferences.loadError')}</p>
				) : (
					<PreferencesForm
						defaultValues={{
							language: data.preferences.language,
							timezone: data.preferences.timezone,
						}}
						currency={data.preferences.currency}
					/>
				)}
			</CardContent>
		</Card>
	)
}
