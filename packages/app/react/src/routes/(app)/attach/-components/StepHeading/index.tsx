import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * Title + subtitle shared by every attach step — LEFT-aligned, no back affordance.
 *
 * THE BACK BUTTON THAT USED TO LIVE HERE IS GONE (D3, founder review 12/08 on the desktop build).
 * The previous shape rendered an absolute-positioned circular back button next to a CENTERED title —
 * "choosing is answering", so the footer had nothing left to do and Voltar had to live somewhere. The
 * founder tested that build and reversed it: "o design vence em TUDO aqui — rodapé persistente com
 * Voltar/Continuar ... posição do Voltar". The wizard's footer (`AttachThreadWizard`) is now the SOLE
 * owner of back/forward navigation, for every step, so this component goes back to being exactly what
 * its name says — a heading. Left alignment is the D3 measurement (32/700 `$foreground` + 16
 * `$muted-foreground`, both `textGrowth: fixed-width` against the full column) and also removes the
 * reason the old back button had to be taken `absolute`-out-of-flow: there is no button to keep a
 * centered title from drifting anymore.
 */
export function StepHeading({ title, subtitle, className, ...props }: ComponentProps<'div'> & { title: string; subtitle: string }) {
	return (
		<div data-slot="step-heading" className={cn('flex flex-col gap-2.5 pb-6 text-left', className)} {...props}>
			<h1 className="heading-display text-4xl text-foreground">{title}</h1>
			<p className="text-muted-foreground">{subtitle}</p>
		</div>
	)
}
