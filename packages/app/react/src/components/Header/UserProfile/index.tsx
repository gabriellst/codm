import { type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { cn, getInitials } from '@/lib/utils'

interface UserProfileProps extends ComponentProps<'div'> {
	user: { name?: string | null; image?: string | null } | undefined
}

export function UserProfile({ user, className, ...props }: UserProfileProps) {
	const { t } = useTranslation()
	if (!user) return null

	const name = user.name ?? t('common.anonymous')
	const picture = user.image ?? null

	return (
		<div className={cn('flex items-center gap-3', className)} data-slot="user-profile" {...props}>
			<div className="text-right hidden sm:block">
				<p className="text-sm font-medium text-foreground leading-tight">{name}</p>
			</div>
			<Avatar size="lg" className="border border-border">
				{picture && <AvatarImage src={picture} alt={name} />}
				<AvatarFallback>{getInitials(name)}</AvatarFallback>
			</Avatar>
		</div>
	)
}
