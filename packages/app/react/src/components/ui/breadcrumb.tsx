import * as React from 'react'
import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'

import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import { IconChevronRight, IconDots } from '@tabler/icons-react'

function Breadcrumb({ className, ...props }: React.ComponentProps<'nav'>) {
	const { t } = useTranslation()
	return <nav aria-label={t('common.breadcrumbLabel')} data-slot="breadcrumb" className={cn(className)} {...props} />
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<'ol'>) {
	return (
		<ol
			data-slot="breadcrumb-list"
			className={cn('text-muted-foreground gap-1.5 text-sm flex flex-wrap items-center break-words', className)}
			{...props}
		/>
	)
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<'li'>) {
	return <li data-slot="breadcrumb-item" className={cn('gap-1 inline-flex items-center', className)} {...props} />
}

function BreadcrumbLink({ className, render, ...props }: useRender.ComponentProps<'a'>) {
	return useRender({
		defaultTagName: 'a',
		props: mergeProps<'a'>(
			{
				// D2 — the reference's global link rule (`a{color:#3D660A} a:hover{color:#161616}`) maps
				// to `--secondary-foreground` (rest) darkening to `--foreground` (hover); overrides the
				// inherited `text-muted-foreground` from `BreadcrumbList`.
				className: cn('text-secondary-foreground hover:text-foreground transition-colors', className),
			},
			props,
		),
		render,
		state: {
			slot: 'breadcrumb-link',
		},
	})
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<'span'>) {
	return <span data-slot="breadcrumb-page" aria-current="page" className={cn('font-normal', className)} {...props} />
}

function BreadcrumbSeparator({ children, className, ...props }: React.ComponentProps<'li'>) {
	return (
		<li data-slot="breadcrumb-separator" role="presentation" aria-hidden="true" className={cn('[&>svg]:size-3.5', className)} {...props}>
			{children ?? <IconChevronRight />}
		</li>
	)
}

function BreadcrumbEllipsis({ className, ...props }: React.ComponentProps<'span'>) {
	const { t } = useTranslation()
	return (
		<span
			data-slot="breadcrumb-ellipsis"
			role="presentation"
			aria-hidden="true"
			className={cn('size-5 [&>svg]:size-4 flex items-center justify-center', className)}
			{...props}
		>
			<IconDots />
			<span className="sr-only">{t('common.more')}</span>
		</span>
	)
}

export { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator, BreadcrumbEllipsis }
