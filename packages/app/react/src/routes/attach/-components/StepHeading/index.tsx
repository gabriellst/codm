import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconChevronLeft } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Centered title + subtitle shared by every attach step — and the single owner of the step's back
 * affordance.
 *
 * WHY THE BACK BUTTON LIVES HERE. The footers are gone: choosing IS answering, so "continue" is
 * inferred from the click on a row (`44f98160`) and only the two steps that still ask something the
 * click cannot say keep a primary action. Back was never an answer to the step — it is navigation, and
 * navigation belongs beside the title, not in a bar shared with the action that closes the question.
 * This component already renders every step's header, so the rule is written once instead of four
 * times.
 *
 * THE PREDICATE IS `onBack`, NOT A STEP COUNT. The wizard hands `onBack` down from the second step on
 * and withholds it on the first, so "can this go back?" is already answered by the step's contract.
 * Re-deriving it from `currentStepIndex > 0` would be the same question answered a second time, in a
 * place that does not know the sequence.
 *
 * HOW THE TITLE STAYS CENTERED. The heading is centered (`items-center` + `text-center`) and the title
 * must not drift because a button is sometimes there. So the button is taken OUT OF FLOW (`absolute`):
 * the centered block is then literally the same node with and without it — there is no gutter to
 * balance and nothing to keep in sync. The in-flow alternative (a three-column grid with a spacer on
 * the right mirroring the button's width) centers correctly today, but ties the center to a spacer
 * someone has to remember the day the button changes size, and it fails silently — the title just
 * walks off-center. The inner block is inset by `px-12` on BOTH sides, which is exactly the button
 * (`size-9` = 36px) plus the 12px gap `PageHeader` puts between button and title: symmetric, so a long
 * title wraps instead of ever running under the gutter, and the centering is unaffected either way.
 */
export function StepHeading({
	title,
	subtitle,
	onBack,
	backDisabled,
	className,
	...props
}: ComponentProps<'div'> & { title: string; subtitle: string; onBack?: () => void; backDisabled?: boolean }) {
	const { t } = useTranslation()
	return (
		<div data-slot="step-heading" className={cn('relative pb-6', className)} {...props}>
			{onBack && (
				// Icon-only, mirroring `PageHeader`'s circular back button — the console's established
				// shape for "up one level". `top-0` lands it on the title's first line without an offset:
				// `.heading-display` runs at `line-height: 0.95`, so a `text-4xl` line box (~34px) and the
				// 36px button share a center.
				<Button
					type="button"
					variant="soft"
					size="icon"
					aria-label={t('attach.back')}
					disabled={backDisabled}
					className="absolute top-0 left-0 size-9 shrink-0 rounded-full"
					onClick={onBack}
				>
					<IconChevronLeft />
				</Button>
			)}
			<div className="flex flex-col items-center gap-2 px-12 text-center">
				<h1 className="heading-display text-4xl text-foreground md:text-4xl">{title}</h1>
				<p className="text-muted-foreground">{subtitle}</p>
			</div>
		</div>
	)
}
