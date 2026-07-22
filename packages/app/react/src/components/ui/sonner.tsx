import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { IconCircleCheck, IconInfoCircle, IconAlertTriangle, IconAlertOctagon, IconLoader } from '@tabler/icons-react'

import { surface } from './surfaces'

function Toaster({ theme = 'system', ...props }: ToasterProps) {
	return (
		<Sonner
			theme={theme}
			className="toaster group"
			icons={{
				success: <IconCircleCheck className="size-4" />,
				info: <IconInfoCircle className="size-4" />,
				warning: <IconAlertTriangle className="size-4" />,
				error: <IconAlertOctagon className="size-4" />,
				loading: <IconLoader className="size-4 animate-spin" />,
			}}
			style={
				// Neutralize sonner's internal --*-bg / --*-border vars so the surface
				// gradient applied via classNames.toast is what gets painted. Per-type
				// text colors are handled by [data-sonner-toast][data-type="…"] rules
				// in index.css.
				{
					'--normal-bg': 'transparent',
					'--normal-text': 'var(--foreground)',
					'--normal-border': 'transparent',
					'--success-bg': 'transparent',
					'--success-text': 'var(--success)',
					'--success-border': 'transparent',
					'--error-bg': 'transparent',
					'--error-text': 'var(--destructive)',
					'--error-border': 'transparent',
					'--warning-bg': 'transparent',
					'--warning-text': 'var(--warning)',
					'--warning-border': 'transparent',
					'--info-bg': 'transparent',
					'--info-text': 'var(--info)',
					'--info-border': 'transparent',
					'--border-radius': 'var(--radius)',
				} as React.CSSProperties
			}
			toastOptions={{
				classNames: {
					toast: `${surface} group toast rounded-lg group-[.toaster]:shadow-lg`,
					description: 'group-[.toast]:text-muted-foreground',
					actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
					cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
				},
			}}
			{...props}
		/>
	)
}

export { Toaster }
