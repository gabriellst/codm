// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-e2e-notifications-flow
// task:        synthetic-e2e-notifications-flow
// stamp:       e2e-notif-iter3
// docTreeHash: ac3703e45efa
// model:       sonnet
// graded:      2026-06-12T00:02:47.630Z
// source:      packages/app/react/src/components/Header/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { Fragment } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { useSession } from '@/hooks'
import { useBreadcrumbs } from '@/hooks/useBreadcrumbs'
import { NotificationsPopover } from './NotificationsPopover'
import { UserProfile } from './UserProfile'
import type { ComponentProps } from 'react'

type HeaderProps = ComponentProps<'header'>

export function Header({ className, ...props }: HeaderProps) {
	const session = useSession()
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
				<NotificationsPopover />
				<div className="h-10 w-px bg-border" />
				<UserProfile user={session?.user} />
			</div>
		</header>
	)
}
