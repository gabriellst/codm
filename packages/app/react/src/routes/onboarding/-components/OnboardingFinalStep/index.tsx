// packages/app/react/src/routes/onboarding/-components/OnboardingFinalStep/index.tsx — COMPLETE final file.
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconCircleCheck } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

/**
 * The wizard's closing panel (spec Decision 4/AC-14) — replaces the ONB-3a placeholder component with
 * real content. `FINAL` is `INFORMATIVE`/`ADVISORY` (`STEP_TAXONOMY`): there is nothing to satisfy
 * here, "Concluir" (`OnboardingFlow`'s own button, not rendered by this component) is what actually
 * ends the flow.
 */
// D3 (screen fa1hL) — the design wraps the seal/title/body AND the "Começar" button inside one
// white card, no dots, no separate footer. `OnboardingFlow`'s shared footer/dots keep rendering
// underneath for THIS step too (registered divergence, see the port report): `STEP_COMPONENTS` is
// a flat `Record<StepId, ReactNode>` built at module scope, with no access to the parent's
// `completeOnboarding` closure — special-casing FINAL to embed the real button would mean either
// duplicating the race-condition-safe invalidate-then-navigate sequence `OnboardingFlow` already
// owns (documented there, and NOT to be forked), or reworking that map into something that takes
// props. Both cost more than this screen's fidelity is worth today. The CARD itself — seal, radius,
// border — is ported exactly; only the button's position stays with the shared footer.
export function OnboardingFinalStep({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	return (
		<div
			className={cn(
				'flex w-full max-w-md flex-col items-center gap-6 rounded-asymmetric-xl border border-border bg-background p-11 text-center',
				className,
			)}
			{...props}
		>
			<span className="flex size-[76px] items-center justify-center rounded-asymmetric-lg bg-primary text-primary-foreground">
				<IconCircleCheck className="size-9" />
			</span>
			<div className="flex flex-col gap-2">
				<h1 className="heading-display text-3xl text-foreground">{t('onboarding.finalTitle')}</h1>
				<p className="text-muted-foreground">{t('onboarding.finalBody')}</p>
			</div>
		</div>
	)
}
