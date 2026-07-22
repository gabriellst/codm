import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { cn } from '@/lib/utils'
import { letterSpacingPt } from '@/lib/tokens'
import { SAFE_TEXT_LINE_HEIGHT_MULTIPLIER } from '@/lib/text-styles'

interface DisplayTitleProps {
	children: ReactNode
	/** Font size in points. Drives lineHeight and the negative-margin compensation. */
	fontSize: number
	/** Extra Tailwind classes. Defaults pin to `text-foreground font-display uppercase`. */
	className?: string
}

/**
 * Big Anton headline that survives iOS RN's text clipping.
 *
 * The Anton font has an ascent of roughly 1.6× its nominal size on iOS,
 * so any single `<Text>` with `lineHeight < 1.6×` clips the glyph at the
 * top of the wrap. Bumping `lineHeight` past the threshold fixes the
 * clip but spreads wrapped lines apart visually. We sidestep the
 * trade-off by splitting the input on `\n` and rendering each visual
 * line in its own `<Text>` (each gets its own clip-safe box), then
 * pulling subsequent lines together with a negative `marginTop`. The
 * outer `<View>` uses negative `marginVertical` to eat the lineHeight
 * box padding so the title sits flush in its parent's gap stack.
 *
 * Static i18n titles include explicit `\n` for predictable line breaks.
 * Dynamic titles without `\n` render as a single line — typically short
 * enough that auto-wrap isn't needed.
 */
export function DisplayTitle({ children, fontSize, className }: DisplayTitleProps) {
	const lines = String(children).split('\n')
	const lineOverlap = -fontSize * 0.6
	const frameBleed = -fontSize * 0.3

	return (
		<View style={{ marginTop: frameBleed, marginBottom: frameBleed }}>
			{lines.map((line, i) => (
				<Text
					key={i}
					className={cn('text-foreground font-display uppercase', className)}
					style={{
						fontSize,
						lineHeight: fontSize * SAFE_TEXT_LINE_HEIGHT_MULTIPLIER,
						letterSpacing: letterSpacingPt(-0.01, fontSize),
						marginTop: i === 0 ? 0 : lineOverlap,
					}}
				>
					{line}
				</Text>
			))}
		</View>
	)
}

/**
 * Inline-friendly companion to `DisplayTitle`. Returns a style object for
 * a single-line Anton `<Text>` that needs to participate in baseline
 * alignment (e.g. tabular numerics rendered next to a unit label inside
 * a `flex-row items-baseline` row). Same clip-safe lineHeight and
 * negative-margin frame bleed as the component — just no wrapper `View`.
 *
 *   <Text style={[displayTextStyle(56), { fontVariant: ['tabular-nums'] }]}>
 *     {value}
 *   </Text>
 */
export function displayTextStyle(fontSize: number) {
	const frameBleed = -fontSize * 0.3
	return {
		fontSize,
		lineHeight: fontSize * SAFE_TEXT_LINE_HEIGHT_MULTIPLIER,
		letterSpacing: letterSpacingPt(-0.01, fontSize),
		marginTop: frameBleed,
		marginBottom: frameBleed,
	} as const
}
