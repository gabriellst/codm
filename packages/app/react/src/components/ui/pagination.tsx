import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { surface } from '@/components/ui/surfaces'
import { IconChevronLeft, IconChevronRight, IconDots } from '@tabler/icons-react'

function Pagination({ className, ...props }: React.ComponentProps<'nav'>) {
	const { t } = useTranslation()
	return (
		<nav aria-label={t('common.paginationLabel')} data-slot="pagination" className={cn('mx-auto flex w-full justify-center', className)} {...props} />
	)
}

function PaginationContent({ className, ...props }: React.ComponentProps<'ul'>) {
	return <ul data-slot="pagination-content" className={cn('gap-0.5 flex items-center', className)} {...props} />
}

function PaginationItem({ ...props }: React.ComponentProps<'li'>) {
	return <li data-slot="pagination-item" {...props} />
}

type PaginationLinkProps = {
	isActive?: boolean
} & Pick<React.ComponentProps<typeof Button>, 'size'> &
	React.ComponentProps<'a'>

function PaginationLink({ className, isActive, size = 'icon', ...props }: PaginationLinkProps) {
	// All items share the outline shape (rounded border). The active item layers the
	// `surface` gradient + a `bg-focus` tint on top so it reads as "selected".
	return (
		<Button
			variant="outline"
			size={size}
			className={cn(isActive && `${surface} bg-focus hover:brightness-100`, className)}
			nativeButton={false}
			render={<a aria-current={isActive ? 'page' : undefined} data-slot="pagination-link" data-active={isActive} {...props} />}
		/>
	)
}

function PaginationPrevious({ className, ...props }: React.ComponentProps<typeof PaginationLink>) {
	const { t } = useTranslation()
	return (
		<PaginationLink aria-label={t('common.goToPreviousPage')} size="default" className={cn('pl-1.5!', className)} {...props}>
			<IconChevronLeft data-icon="inline-start" />
			<span className="hidden sm:block">{t('common.previous')}</span>
		</PaginationLink>
	)
}

function PaginationNext({ className, ...props }: React.ComponentProps<typeof PaginationLink>) {
	const { t } = useTranslation()
	return (
		<PaginationLink aria-label={t('common.goToNextPage')} size="default" className={cn('pr-1.5!', className)} {...props}>
			<span className="hidden sm:block">{t('common.next')}</span>
			<IconChevronRight data-icon="inline-end" />
		</PaginationLink>
	)
}

function PaginationEllipsis({ className, ...props }: React.ComponentProps<'span'>) {
	const { t } = useTranslation()
	return (
		<span
			aria-hidden
			data-slot="pagination-ellipsis"
			className={cn("size-8 items-center justify-center [&_svg:not([class*='size-'])]:size-4 flex items-center justify-center", className)}
			{...props}
		>
			<IconDots />
			<span className="sr-only">{t('common.morePages')}</span>
		</span>
	)
}

export { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious }
