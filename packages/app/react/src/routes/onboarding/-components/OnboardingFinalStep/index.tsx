// packages/app/react/src/routes/onboarding/-components/OnboardingFinalStep/index.tsx — COMPLETE final file.
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { IconCheck, IconCopy } from '@tabler/icons-react'
import { useGetSessionChat } from '@codm/client-typescript/typescript'
import { Button } from '@codm/app-ui/button'
import { tryCatchAsync } from '@/lib'
import { cn } from '@/lib/utils'
import { useOnboardingSetupStore } from '../../-stores/useOnboardingSetupStore'

/**
 * The wizard's closing panel (spec Decision 4/AC-14) — replaces the ONB-3a placeholder component with
 * real content. `FINAL` is `INFORMATIVE`/`ADVISORY` (`STEP_TAXONOMY`): there is nothing to satisfy
 * here, "Concluir" (`OnboardingFlow`'s own button, not rendered by this component) is what actually
 * ends the flow.
 *
 * REWRITTEN for the 2026-08-24 onboarding-attach-ux audit (item 7) — founder directive: the closing
 * card now celebrates with 🎉 and, when this onboarding session actually attached a thread, tells the
 * operator the exact message to send to summon the agent. `tudo-pronto-wrapper` is an ACTIVE measured
 * fidelity target (unlike WORKSPACE/CONTACT/AGENTS/REVIEW, which have none) — this is a founder
 * directive overriding that target on purpose; flagged here for the re-measurement it needs, not a
 * silent drift.
 *
 * THE MENTION IS NEVER FABRICATED. `attachedThreadId` (`useOnboardingSetupStore`, set by
 * `OnboardingReviewStep` the moment `useAttachThread` resolves) is the only link between this step and
 * a real thread — REVIEW is DEFERRABLE, not REQUIRED, so an operator can reach FINAL having skipped it
 * entirely, and `attachedThreadId` stays `undefined` in that case. The mention tag itself
 * (`session.mentionGate.tag`) is minted server-side from the workspace folder name
 * (`Thread.entities`'s `mintMentionTag` — e.g. `/Users/x/codm` → `@codm`) and defaults to `enabled`
 * on every new thread (`Thread.create`), so it is available as soon as the thread exists — no extra
 * operator configuration required. Both gates (`attachedThreadId` present AND
 * `mentionGate.enabled`) must hold before the mention copy renders; either miss falls back to the
 * original generic closing body instead of guessing a handle.
 *
 * COPY-TO-CLIPBOARD (2026-08-25, founder follow-up). No existing copy hook/util anywhere in the repo
 * (grepped `navigator.clipboard`/`useCopy`/`IconCopy` — nothing) — `navigator.clipboard.writeText`
 * direct in the handler, as sanctioned for this one-off, WRAPPED in `tryCatchAsync` (`@/lib`, bp-28 —
 * app code never writes a raw try/catch; this is the typed-result wrapper the rest of the app uses).
 * Copies the SAME interpolated string the `<p>` below renders
 * (`t('onboarding.finalMentionMessage', { mention })`), never a template with the literal
 * `{{mention}}` token still in it. Success → `toast.success` (own i18n key, `finalMentionCopied`); a
 * clipboard failure (permission denied, no secure context) → the plain `common.errorTitle` toast
 * every other ad-hoc local failure in this app uses — this is a client-only action with no
 * `ErrorCode` to route through `handleApiError`, so it sits OUTSIDE the `suppressToast` mechanism
 * entirely (that's for the three onboarding MUTATIONS, not this). No post-copy check-swap state: no
 * precedent for that microinteraction anywhere in the catalog, and the task said not to invent one.
 */
export function OnboardingFinalStep({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const attachedThreadId = useOnboardingSetupStore(state => state.attachedThreadId)
	const { data: session } = useGetSessionChat(attachedThreadId ?? '', { query: { enabled: !!attachedThreadId } })
	const mention = session?.mentionGate.enabled ? session.mentionGate.tag : undefined
	const mentionMessage = mention ? t('onboarding.finalMentionMessage', { mention }) : undefined

	const handleCopy = async () => {
		if (!mentionMessage) return
		const result = await tryCatchAsync(() => navigator.clipboard.writeText(mentionMessage))
		if (result.success) {
			toast.success(t('onboarding.finalMentionCopied'))
		} else {
			toast.error(t('common.errorTitle'))
		}
	}

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
				<p className="text-muted-foreground">{mention ? t('onboarding.finalMentionIntro') : t('onboarding.finalBody')}</p>
			</div>
			{mentionMessage && (
				<div className="relative w-full">
					{/* `pr-9`/`pb-9` clear the corner button — bottom-right of the block, per the founder's
					    spec — so a longer mention tag never runs under the icon. canon 22: the `Button`
					    primitive (`ghost`/`icon-sm`), same absolute-corner composition `Sheet`'s own close
					    trigger already uses, anchored to the opposite corner (bottom-right, not top-right). */}
					<p className="w-full rounded-asymmetric-md bg-muted py-3 pr-4 pl-4 text-left font-mono text-sm text-foreground">
						{mentionMessage}
					</p>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						className="absolute right-2 bottom-2"
						aria-label={t('onboarding.finalMentionCopyLabel')}
						onClick={handleCopy}
					>
						<IconCopy />
					</Button>
				</div>
			)}
		</div>
	)
}
