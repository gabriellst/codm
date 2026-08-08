import { Fragment } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { useBreadcrumbs } from '@/hooks/useBreadcrumbs'
import { NotificationsPopover } from './NotificationsPopover'
import { UserProfile } from './UserProfile'
import type { ComponentProps } from 'react'

type HeaderProps = ComponentProps<'header'>

// TODO: Replace with real notification data hook when SDK supports it.
const MOCK_NOTIFICATIONS: { items: never[] } = { items: [] }

export function Header({ className, ...props }: HeaderProps) {
	const breadcrumbs = useBreadcrumbs()

	return (
		<header
			className={cn('h-[52px] min-h-[52px] bg-card border-b border-border flex items-center justify-between px-6 shrink-0 z-20', className)}
			{...props}
		>
			<Breadcrumb>
				<BreadcrumbList>
					{breadcrumbs.map((crumb, index) => {
						const isLast = index === breadcrumbs.length - 1
						return (
							<Fragment key={`${crumb.label}-${index}`}>
								<BreadcrumbItem>
									{isLast || !crumb.to ? (
										<BreadcrumbPage>{crumb.label}</BreadcrumbPage>
									) : (
										<BreadcrumbLink render={<Link to={crumb.to}>{crumb.label}</Link>} />
									)}
								</BreadcrumbItem>
								{!isLast && <BreadcrumbSeparator />}
							</Fragment>
						)
					})}
				</BreadcrumbList>
			</Breadcrumb>

			<div className="flex items-center gap-4">
				<NotificationsPopover notifications={MOCK_NOTIFICATIONS.items} />
				<div className="h-10 w-px bg-border" />
				{/* Sem prop de dado: o perfil resolve a própria identidade (canal conectado → sessão
				    constante). Ver o docblock de `UserProfile` para os termos desse empréstimo. */}
				<UserProfile />
			</div>
		</header>
	)
}
