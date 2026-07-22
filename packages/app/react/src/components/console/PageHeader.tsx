import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconChevronLeft } from '@tabler/icons-react'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The recurring sub-page masthead: a circular back button, a heavy display title,
 * an optional stats/subtitle line, and a right-aligned action slot. Home omits the
 * back button (`back={false}`); every other console page renders it.
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
		<div className={cn('flex flex-col gap-4', className)}>
			{back && (
				<Button variant="secondary" size="icon" aria-label={t('console.back')} className="rounded-full" onClick={() => router.history.back()}>
					<IconChevronLeft />
				</Button>
			)}
			<div className="flex items-start justify-between gap-4">
				<div className="flex flex-col gap-2">
					<h1 className="heading-display text-3xl text-foreground md:text-4xl">{title}</h1>
					{subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
				</div>
				{action && <div className="shrink-0">{action}</div>}
			</div>
		</div>
	)
}
