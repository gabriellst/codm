// packages/app/react/src/routes/(app)/dashboard/-components/MentionCta/index.tsx — COMPLETE final file.
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { IconCopy, IconMessage2 } from '@tabler/icons-react'
import { useGetHomeDashboard } from '@codm/client-typescript/typescript'
import { Button } from '@codm/app-ui/button'
import { tryCatchAsync } from '@/lib'
import { cn } from '@/lib/utils'

/**
 * The dashboard's own "mencione o agente" follow-up (moved here 2026-08-26 from
 * `onboarding/-components/OnboardingFinalStep`, which showed this same message keyed off a
 * `threadId` a Zustand store held for exactly one React tick — `OnboardingFlow`'s
 * `completeOnboarding.onSuccess` invalidated and navigated away in the SAME tick it stashed the id,
 * so the `useGetSessionChat` round-trip that card needed was never actually observed to resolve
 * before the route unmounted it).
 *
 * SERVER-DRIVEN, not local state: `GetHomeDashboard.mentionCta` is present exactly when a thread
 * exists, its mention gate is enabled, and nobody carrying the operator sentinel has written a line
 * in it yet — see that field's own docblock for the full three-fact rule. This component owns that
 * read itself (`useGetHomeDashboard()`, the same query `HomeDashboard` already calls — React Query
 * dedupes it into one request) rather than receiving the slice as a prop, same canon every other
 * dashboard section here follows.
 *
 * Renders nothing while the condition doesn't hold — same "quietly absent" contract as
 * `SetupChecklist` (returns `null` once every step is done) and `HomeDashboard`'s own `needsYou`
 * callout (only rendered when present).
 *
 * COPY-TO-CLIPBOARD mirrors the OLD `OnboardingFinalStep` implementation verbatim:
 * `navigator.clipboard.writeText`, wrapped in `tryCatchAsync` (`@/lib`, bp-28 — app code never
 * writes a raw try/catch). Copies the SAME interpolated string the paragraph below renders, never a
 * template with the literal `{{mention}}` token still in it. A clipboard failure (permission denied,
 * no secure context) is a client-only condition with no `ErrorCode` to route through
 * `handleApiError`, so it uses the plain `common.errorTitle` toast every other ad-hoc local failure
 * in this app uses.
 */
export function MentionCta({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const { data } = useGetHomeDashboard()
	const mentionCta = data?.mentionCta
	if (!mentionCta) return null

	const message = t('dashboard.mentionCtaMessage', { mention: mentionCta.tag })

	const handleCopy = async () => {
		const result = await tryCatchAsync(() => navigator.clipboard.writeText(message))
		if (result.success) {
			toast.success(t('dashboard.mentionCtaCopied'))
		} else {
			toast.error(t('common.errorTitle'))
		}
	}

	return (
		<div
			className={cn('relative flex flex-col gap-3.5 rounded-asymmetric-lg border border-border bg-background px-5 py-4', className)}
			{...props}
		>
			<div className="flex items-center gap-3.5">
				<span className="flex size-8 shrink-0 items-center justify-center rounded-asymmetric-2xs bg-secondary text-secondary-foreground">
					<IconMessage2 className="size-[19px]" />
				</span>
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="text-[15px] font-bold text-foreground">{t('dashboard.mentionCtaTitle')}</span>
					<span className="text-[13px] text-muted-foreground">{t('dashboard.mentionCtaDescription')}</span>
				</div>
			</div>
			{/* `pr-9` clears the corner button, same clearance `OnboardingFinalStep` used to reserve for
			    the identical block — a long mention tag never runs under the icon. */}
			<div className="relative">
				<p className="w-full rounded-asymmetric-md bg-muted py-3 pr-9 pl-4 text-left font-mono text-sm text-foreground">{message}</p>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					className="absolute right-2 top-1/2 -translate-y-1/2"
					aria-label={t('dashboard.mentionCtaCopyLabel')}
					onClick={handleCopy}
				>
					<IconCopy />
				</Button>
			</div>
		</div>
	)
}
