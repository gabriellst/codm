import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { IconCircleCheck, IconInfoCircle, IconAlertTriangle, IconAlertOctagon, IconLoader } from '@tabler/icons-react'

import { cn } from '@/lib/utils'
import { surface } from './surfaces'

function Toaster({ theme = 'system', className, ...props }: ToasterProps) {
	return (
		<Sonner
			theme={theme}
			// cn(), não literal: `{...props}` vem DEPOIS, então um `className` do chamador substituiria
			// "toaster group" e derrubaria o alvo dos seletores de tema. Mesclado, ele só se soma.
			className={cn('toaster group', className)}
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
					// NOTE: `src/index.css` sets `[data-sonner-toast] { border-radius: var(--radius) !important }`
					// (plain, symmetric) — that `!important` wins over this class regardless, so this step is
					// updated for source-correctness but the rendered toast radius is governed by index.css,
					// outside this pass's `components/ui/**` scope.
					toast: `${surface} group toast rounded-asymmetric-lg group-[.toaster]:shadow-lg`,
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
