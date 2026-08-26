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
 * ### 2026-08-26 — the "mention the agent" CTA, restored
 * The 2026-08-24 audit gave this card an `attachedThreadId`-driven variant: when REVIEW's own
 * `useAttachThread` call resolved, its `threadId` was stashed on a store so this step could look up
 * the thread's mention tag and hand the operator a ready-to-send message. The SAME-DAY draft/
 * atomic-commit rewrite moved thread creation OUT of REVIEW and into `CompleteOnboarding` — and, for
 * one regression window, that use case returned `void`, so this CTA had nowhere left to read a
 * `threadId` from and was removed along with its 4 i18n keys.
 *
 * `CompleteOnboarding` now answers `{ threadId: string | null }` (its own docblock covers the two
 * idempotent paths and why `null` is sometimes honest), and `OnboardingFlow`'s
 * `completeOnboarding.onSuccess` stashes it on `useOnboardingSetupStore.completedThreadId` — the only
 * channel that reaches this component (no props threading — `STEP_COMPONENTS` is a static
 * `Record<StepId, ReactNode>`, same constraint `confirmStep` documents). `completedThreadId` is
 * `undefined` until "Concluir" actually resolves and `null` when the backend could not resolve a
 * thread for the idempotent-already-completed path — both degrade to the generic closing body below,
 * never a fabricated handle.
 *
 * THE MENTION IS NEVER FABRICATED. The mention tag itself (`session.mentionGate.tag`) is minted
 * server-side from the workspace folder name (`Thread.entities`'s `mintMentionTag` — e.g.
 * `/Users/x/codm` → `@codm`) and defaults to `enabled` on every new thread (`Thread.create`), so it is
 * available as soon as the thread exists — no extra operator configuration required. Both gates
 * (`completedThreadId` present AND `mentionGate.enabled`) must hold before the mention copy renders;
 * either miss falls back to the original generic closing body instead of guessing a handle.
 *
 * COPY-TO-CLIPBOARD. `navigator.clipboard.writeText` direct in the handler, WRAPPED in `tryCatchAsync`
 * (`@/lib`, bp-28 — app code never writes a raw try/catch). Copies the SAME interpolated string the
 * `<p>` below renders (`t('onboarding.finalMentionMessage', { mention })`), never a template with the
 * literal `{{mention}}` token still in it. Success → `toast.success` (own i18n key,
 * `finalMentionCopied`); a clipboard failure (permission denied, no secure context) → the plain
 * `common.errorTitle` toast every other ad-hoc local failure in this app uses — this is a client-only
 * action with no `ErrorCode` to route through `handleApiError`, so it sits OUTSIDE the
 * `suppressToast` mechanism entirely (that's for the onboarding MUTATIONS, not this).
 */
export function OnboardingFinalStep({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const completedThreadId = useOnboardingSetupStore(state => state.completedThreadId)
	const { data: session } = useGetSessionChat(completedThreadId ?? '', { query: { enabled: !!completedThreadId } })
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
