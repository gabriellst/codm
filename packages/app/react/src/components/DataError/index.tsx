import type { ComponentProps } from 'react'
import { IconAlertCircle, IconRefresh } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@codm/app-ui/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@codm/app-ui/empty'
import { cn } from '@/lib/utils'

interface DataErrorProps extends Pick<ComponentProps<typeof Empty>, 'className'> {
	title?: string
	description?: string
	onRetry?: () => void
}

export function DataError({ title, description, onRetry, className }: DataErrorProps) {
	const { t } = useTranslation()
	const resolvedTitle = title ?? t('common.errorTitle')
	const resolvedDescription = description ?? t('errors.UNKNOWN_ERROR')

	return (
		<Empty className={cn('flex-1 border-none', className)}>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<IconAlertCircle className="text-destructive" />
				</EmptyMedia>
				<EmptyTitle>{resolvedTitle}</EmptyTitle>
				<EmptyDescription>{resolvedDescription}</EmptyDescription>
			</EmptyHeader>
			{onRetry && (
				<EmptyContent>
					<Button variant="outline" size="sm" onClick={onRetry}>
						<IconRefresh data-icon="inline-start" />
						{t('common.retry')}
					</Button>
				</EmptyContent>
			)}
		</Empty>
	)
}
