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
 * ### 2026-08-26 — the "mention the agent" CTA is gone, and why
 * The 2026-08-24 audit gave this card a `attachedThreadId`-driven variant: when REVIEW's own
 * `useAttachThread` call resolved, its `threadId` was stashed on `useOnboardingSetupStore` so this
 * step could look up the thread's mention tag and hand the operator a ready-to-send message. The
 * draft/atomic-commit rewrite (same date) moved thread creation OUT of REVIEW entirely —
 * `CompleteOnboarding` is now the only place `AttachThread` runs, composed with `AddWorkspace` in one
 * transaction at "Concluir" time — and its response carries no `threadId` back to the client
 * (`CompleteOnboardingOutputSchema = z.void()`). There is therefore no thread id left anywhere on the
 * client to mint a mention tag from; keeping the field around forever `undefined` would have been
 * dead state pretending to be a feature. Restoring this CTA is a backend-surface change (`
 * CompleteOnboarding` would need to return the materialized `threadId`) — out of scope here, flagged
 * as a follow-up rather than silently dropped.
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
