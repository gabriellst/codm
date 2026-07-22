import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useGetMyAccount } from '@template/client-typescript/typescript'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { GradientIconBadge } from '@/components/ui/gradient-icon-badge'
import { UserIcon } from '@/components/ui/icons'
import { cn } from '@/lib/utils'

import { ProfileForm } from './ProfileForm'

/**
 * ProfileFormSection — owns the useGetMyAccount query and renders ProfileForm once data arrives.
 * Shows skeletons while loading and an error message if the query fails.
 */
export function ProfileFormSection({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const { data, isPending, isError } = useGetMyAccount()

	const fallbackInitials = data?.profile.name
		? data.profile.name
				.split(' ')
				.filter(Boolean)
				.slice(0, 2)
				.map(w => w[0])
				.join('')
				.toUpperCase()
		: '?'

	return (
		<Card className={cn('gap-0 p-0', className)} {...props}>
			<CardHeader className="flex flex-row items-center gap-3 border-b border-border/60 px-5 py-4">
				<GradientIconBadge icon={UserIcon} />
				<div className="flex min-w-0 flex-col gap-0.5">
					<CardTitle className="text-sm font-semibold text-foreground">{t('account.profile.sectionTitle')}</CardTitle>
					<CardDescription className="text-xs">{t('account.profile.sectionDescription')}</CardDescription>
				</div>
			</CardHeader>

			<CardContent className="px-5 py-6">
				{isPending ? (
					<div className="flex flex-col gap-4">
						<div className="flex items-center gap-4">
							<Skeleton className="size-16 rounded-full" />
							<div className="flex flex-col gap-2">
								<Skeleton className="h-8 w-24 rounded-lg" />
								<Skeleton className="h-8 w-20 rounded-lg" />
							</div>
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							{Array.from({ length: 3 }).map((_, i) => (
								<div key={i} className="flex flex-col gap-1.5">
									<Skeleton className="h-4 w-16 rounded" />
									<Skeleton className="h-8 w-full rounded-lg" />
								</div>
							))}
						</div>
					</div>
				) : isError || !data ? (
					<p className="text-sm text-muted-foreground">{t('account.profile.loadError')}</p>
				) : (
					<ProfileForm
						defaultValues={{
							name: data.profile.name,
							email: data.profile.email,
							company: data.profile.company,
							pictureUrl: data.profile.pictureUrl,
						}}
						fallbackInitials={fallbackInitials}
					/>
				)}
			</CardContent>
		</Card>
	)
}
