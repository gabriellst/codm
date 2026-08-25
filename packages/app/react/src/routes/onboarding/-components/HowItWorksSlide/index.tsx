import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowRight, IconCircleDot, IconCornerDownLeft, IconMessageCircle, IconTerminal } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

// D3 (screen FPKgO) — the numbered list became a 4-card diagram (message → issue → terminal
// session → reply), connected by arrows: the shape of one round-trip through the product, not a
// checklist of setup chores. Icons/labels are what the design measures on the canvas, not the
// three setup-step keys the old list borrowed (those describe the WIZARD's own steps, a different
// thing from "how a conversation turns into work").
//
// F3 B2 — the "terminal" glyph is `IconTerminal` (canon 9: `library:"lucide"` in the spec is
// literal, and lucide's plain "terminal" icon is the bare `>_` prompt, no outer window frame).
// `IconTerminal2` (the previous choice) draws a rounded-rect device frame AROUND that glyph — a
// different lucide icon (`terminal-square`), visibly boxed in the delta against the target PNG.
const DIAGRAM_STEPS = [
	{ id: 'message', icon: IconMessageCircle, labelKey: 'onboarding.diagramMessage' },
	{ id: 'issue', icon: IconCircleDot, labelKey: 'onboarding.diagramIssue' },
	{ id: 'terminal', icon: IconTerminal, labelKey: 'onboarding.diagramTerminal' },
	{ id: 'reply', icon: IconCornerDownLeft, labelKey: 'onboarding.diagramReply' },
] as const

/** Slide 2 — how it works: message → issue → terminal session → reply, as a connected diagram. */
export function HowItWorksSlide({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	return (
		<div className={cn('flex w-full flex-col items-center gap-8', className)} {...props}>
			<h1 className="heading-display text-4xl text-foreground md:text-5xl">{t('onboarding.slide2Title')}</h1>
			<div className="flex items-center gap-3">
				{DIAGRAM_STEPS.map((step, i) => (
					<div key={step.id} className="flex items-center gap-3">
						{i > 0 && <IconArrowRight className="size-4 shrink-0 text-muted-foreground" />}
						<div className="flex w-[150px] flex-col items-center gap-3 rounded-asymmetric-lg border border-border bg-background p-4.5">
							<span className="flex size-9 items-center justify-center rounded-asymmetric-xs bg-secondary text-secondary-foreground">
								<step.icon className="size-[18px]" />
							</span>
							<span className="text-center text-[13px] font-semibold text-foreground">{t(step.labelKey)}</span>
						</div>
					</div>
				))}
			</div>
		</div>
	)
}
