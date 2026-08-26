// packages/app/react/src/routes/onboarding/-components/OnboardingFinalStep/index.tsx — COMPLETE final file.
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconCheck } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

/**
 * The wizard's closing panel (spec Decision 4/AC-14) — replaces the ONB-3a placeholder component with
 * real content. `FINAL` is `INFORMATIVE`/`ADVISORY` (`STEP_TAXONOMY`): there is nothing to satisfy
 * here, "Concluir" (`OnboardingFlow`'s own button, not rendered by this component) is what actually
 * ends the flow.
 *
 * ### 2026-08-26 — the "mention the agent" CTA moved to the dashboard
 * This card used to grow a second variant here: once `completeOnboarding.onSuccess` stashed a
 * `threadId` on `useOnboardingSetupStore`, this step looked it up via `useGetSessionChat` and, if the
 * thread's mention gate was enabled, swapped the generic body for a ready-to-copy "mention the agent"
 * message. That never actually painted in practice — `onSuccess` invalidates the onboarding query and
 * calls `navigate({ to: '/dashboard' })` in the SAME tick it stashes the id, so the `useGetSessionChat`
 * round-trip this card needed was still in flight when the route unmounted it.
 *
 * The CTA now lives on the dashboard instead (`dashboard/-components/MentionCta`), driven by a
 * SERVER-side field (`GetHomeDashboard`'s `mentionCta`) rather than a value that only ever existed for
 * one React tick on a Zustand store — see that use case's own docblock for the three-fact rule. This
 * step is back to being purely `INFORMATIVE`: the seal, the title, the generic closing body, nothing
 * else to branch on.
 */
export function OnboardingFinalStep({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()

	return (
		<div
			className={cn(
				// `max-w-[460px]` — spec `screen fa1hL`, "Bloco A — Tudo pronto" width:460 (no reusable
				// container-width token in the .pen; `max-w-md` (28rem, ≈392px under this app's 1512px
				// responsive root-font breakpoint) fell 68px short and wrapped the body to 2 lines the
				// design renders on 1).
				'flex w-full max-w-[460px] flex-col items-center gap-6 rounded-asymmetric-xl border border-border bg-background p-11 text-center',
				className,
			)}
			{...props}
		>
			<span className="flex size-[76px] items-center justify-center rounded-asymmetric-lg bg-primary text-primary-foreground">
				<IconCheck className="size-9" />
			</span>
			<div className="flex flex-col gap-2">
				<h1 className="heading-display text-3xl text-foreground">{t('onboarding.finalTitle')}</h1>
				<p className="text-muted-foreground">{t('onboarding.finalBody')}</p>
			</div>
		</div>
	)
}
