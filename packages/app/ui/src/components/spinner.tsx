import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import { IconLoader2 } from '@tabler/icons-react'

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
	const { t } = useTranslation()
	return (
		<IconLoader2
			data-slot="spinner"
			role="status"
			aria-label={t('common.loading')}
			className={cn('size-4 animate-spin', className)}
			{...props}
		/>
	)
}

export { Spinner }
