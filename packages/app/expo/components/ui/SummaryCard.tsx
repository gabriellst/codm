import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { GradientCard, type GradientCardProps } from '@/components/ui/GradientCard'
import { displayTextStyle } from '@/components/ui/DisplayTitle'
import { fs } from '@/lib/tokens'
import { cn } from '@/lib/utils'

interface SummaryCardProps {
	title: string
	/** Small subtitle line under the title (duration · sets · last kg, etc.). */
	meta?: string
	/** Optional left slot — typically a status badge / icon. */
	leading?: ReactNode
	/** Optional right slot — chevron, total volume, pill, etc. */
	trailing?: ReactNode
	/** Tap handler — when set, the card upgrades to a pressable via `GradientCard`. */
	onPress?: () => void
	/** Gradient stroke + surface tone. Defaults to `surface1`. */
	tone?: GradientCardProps['tone']
	/** Override the Anton title color when the variant calls for it (e.g. success). */
	titleClassName?: string
	/** Cap the title at this many lines. Defaults to 1 — workout/exercise titles are short. */
	titleNumberOfLines?: number
	accessibilityLabel?: string
}

/**
 * Slim row card built on top of `GradientCard` — Anton uppercase title,
 * small meta subtitle, optional leading badge and trailing slot. The
 * canonical visual for "list item that summarizes one thing": past
 * workouts in History, completed exercises in the workout list, anywhere
 * a tappable summary row sits in a vertical stack against the dark
 * surface.
 *
 * For richer cards (stat columns, full-width CTAs, multi-section layout),
 * drop down to `GradientCard` directly and assemble the body manually —
 * this primitive is intentionally constrained to the row pattern.
 */
export function SummaryCard({
	title,
	meta,
	leading,
	trailing,
	onPress,
	tone = 'surface1',
	titleClassName,
	titleNumberOfLines = 1,
	accessibilityLabel,
}: SummaryCardProps) {
	return (
		<GradientCard tone={tone} radius="md" padding="none" onPress={onPress} accessibilityLabel={accessibilityLabel ?? title}>
			<View className="flex-row items-center gap-3 px-4 py-3.5">
				{leading}
				<View className="flex-1 min-w-0">
					<Text
						className={cn('text-foreground font-display uppercase', titleClassName)}
						style={displayTextStyle(fs.lg)}
						numberOfLines={titleNumberOfLines}
					>
						{title}
					</Text>
					{meta ? (
						<Text className="text-foreground-subtle font-sans text-xs mt-1" numberOfLines={1}>
							{meta}
						</Text>
					) : null}
				</View>
				{trailing}
			</View>
		</GradientCard>
	)
}
