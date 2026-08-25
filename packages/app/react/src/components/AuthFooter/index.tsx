import { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

export function AuthFooter({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	return (
		<div className={cn('mt-8 flex items-center justify-center gap-4 text-xs text-muted-foreground', className)} {...props}>
			<a href="/" className="hover:text-foreground transition-colors">
				{t('common.help')}
			</a>
			<span>•</span>
			<a href="/" className="hover:text-foreground transition-colors">
				{t('common.privacy')}
			</a>
			<span>•</span>
			<a href="/" className="hover:text-foreground transition-colors">
				{t('common.terms')}
			</a>
		</div>
	)
}
