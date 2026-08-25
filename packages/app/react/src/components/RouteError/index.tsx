import type { ComponentProps } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@codm/app-ui/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@codm/app-ui/empty'
import { cn } from '@/lib/utils'

interface RouteErrorProps extends Pick<ComponentProps<typeof Empty>, 'className'> {
	title?: string
	description?: string
}

export function RouteError({ title, description, className }: RouteErrorProps) {
	const router = useRouter()
	const { t } = useTranslation()
	const resolvedTitle = title ?? t('common.errorTitle')
	const resolvedDescription = description ?? t('errors.UNKNOWN_ERROR')

	return (
		<Empty className={cn('flex-1 border-none', className)}>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<IconAlertTriangle className="text-destructive" />
				</EmptyMedia>
				<EmptyTitle>{resolvedTitle}</EmptyTitle>
				<EmptyDescription>{resolvedDescription}</EmptyDescription>
			</EmptyHeader>
			<EmptyContent>
				<Button variant="outline" size="sm" onClick={() => router.history.back()}>
					{t('common.back')}
				</Button>
			</EmptyContent>
		</Empty>
	)
}
