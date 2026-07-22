import type { ReactNode } from 'react'
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
}: {
	title: ReactNode
	subtitle?: ReactNode
	action?: ReactNode
	back?: boolean
	className?: string
}) {
	const router = useRouter()
	const { t } = useTranslation()
	return (
		<div className={cn('flex items-start justify-between gap-4', className)}>
			<div className="flex min-w-0 flex-1 flex-col gap-2">
				<div className="flex items-center gap-3">
					{back && (
						<Button
							variant="secondary"
							size="icon"
							aria-label={t('console.back')}
							className="size-9 shrink-0 rounded-full"
							onClick={() => router.history.back()}
						>
							<IconChevronLeft />
						</Button>
					)}
					<h1 className="heading-display text-3xl text-foreground md:text-4xl">{title}</h1>
				</div>
				{subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
			</div>
			{action && <div className="shrink-0">{action}</div>}
		</div>
	)
}
