import type { ComponentProps, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconChevronLeft } from '@tabler/icons-react'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The recurring sub-page masthead: a circular back button sitting INLINE to the left of a heavy
 * display title (same row — never floating above it), an optional stats/subtitle line beneath, and
 * a right-aligned action slot. Home omits the back button (`back={false}`); every other console
 * page renders it.
 */
export function PageHeader({
	title,
	subtitle,
	action,
	back = true,
	className,
	...props
}: ComponentProps<'div'> & {
	title: ReactNode
	subtitle?: ReactNode
	action?: ReactNode
	back?: boolean
}) {
	const router = useRouter()
	const { t } = useTranslation()
	return (
		<div className={cn('flex items-start justify-between gap-4', className)} {...props}>
			<div className="flex min-w-0 flex-1 items-center gap-3">
				{back && (
					<Button
						variant="ghost"
						size="icon-lg"
						aria-label={t('console.back')}
						className="bg-muted shrink-0"
						onClick={() => router.history.back()}
					>
						<IconChevronLeft />
					</Button>
				)}
				{/* Title + subtitle share a column so the subtitle left-aligns with the TITLE TEXT,
				    not the container edge (it must never hang under the back button). */}
				<div className="flex min-w-0 flex-col gap-1.5">
					<h1 className="heading-display text-4xl text-foreground md:text-4xl">{title}</h1>
					{subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
				</div>
			</div>
			{action && <div className="shrink-0">{action}</div>}
		</div>
	)
}
