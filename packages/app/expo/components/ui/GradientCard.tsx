import { forwardRef, type ReactNode } from 'react'
import { Animated, Pressable, StyleSheet, View, type ViewProps } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { cn } from '@/lib/utils'
import { surfaces } from '@/lib/tokens'
import { useAnimatedPress } from '@/lib/use-animated-press'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * GradientCard — opt-in card surface with a glossy gradient stroke.
 *
 * Used on a small set of high-signal surfaces (workout exercise cards, the
 * history empty state). For everyday cards keep using the flat `Card`
 * primitive — the gradient is intentionally reserved so it stays special.
 *
 * Visual contract:
 *   1. Outer 1pt ring driven by a vertical "border" gradient (bright top,
 *      dim bottom) — the glossy stroke.
 *   2. Inner surface is a solid color so content reads against a steady
 *      background; the depth comes from the ring, not from a fading fill.
 *
 * Tones:
 * - `surface1` (default): everyday neutral.
 * - `surface2`: lifted a notch, raised / hover surfaces.
 * - `success`: green-tinted ring for completed / positive states.
 *
 * Press behavior: pass an `onPress` and the card upgrades itself to an
 * `AnimatedPressable` with the shared press animation. No `onPress` →
 * static `View`.
 */
type GradientCardTone = 'surface1' | 'surface2' | 'success'
type GradientCardPadding = 'none' | 'sm' | 'md' | 'lg'
type GradientCardRadius = 'sm' | 'md' | 'lg'

const RADIUS_PT: Record<GradientCardRadius, number> = { sm: 12, md: 16, lg: 24 }

const PADDING_CLASS: Record<GradientCardPadding, string> = {
	none: '',
	sm: 'p-3',
	md: 'p-4',
	lg: 'p-5',
}

interface ToneStops {
	/** Border ring — top → bottom gradient stops (the glossy stroke). */
	border: readonly [string, string]
	/** Solid background color for the inner surface. */
	surface: string
}

const TONE_STOPS: Record<GradientCardTone, ToneStops> = {
	surface1: {
		border: ['rgba(255,255,255,0.20)', 'rgba(255,255,255,0.04)'],
		surface: surfaces.surface1,
	},
	surface2: {
		border: ['rgba(255,255,255,0.26)', 'rgba(255,255,255,0.06)'],
		surface: surfaces.surface2,
	},
	success: {
		border: ['rgba(74,222,128,0.45)', 'rgba(74,222,128,0.08)'],
		surface: surfaces.surface1,
	},
}

export interface GradientCardProps extends Omit<ViewProps, 'style' | 'children'> {
	tone?: GradientCardTone
	padding?: GradientCardPadding
	radius?: GradientCardRadius
	children?: ReactNode
	/** When set, renders as an `AnimatedPressable` with the standard press animation. */
	onPress?: () => void
	className?: string
}

export const GradientCard = forwardRef<View, GradientCardProps>(function GradientCard(
	{ tone = 'surface1', padding = 'md', radius = 'md', className, children, onPress, ...rest },
	ref,
) {
	// Hook always runs (rules-of-hooks). Values are no-ops when not interactive.
	const press = useAnimatedPress({ scaleTo: 0.985, opacityTo: 0.9 })

	const radiusPt = RADIUS_PT[radius]
	const paddingClass = PADDING_CLASS[padding]
	const isInteractive = onPress != null
	const Container = isInteractive ? AnimatedPressable : View
	const interactiveProps = isInteractive
		? {
				onPress,
				onPressIn: press.onPressIn,
				onPressOut: press.onPressOut,
				accessibilityRole: 'button' as const,
			}
		: {}

	const stops = TONE_STOPS[tone]
	// Inner surface sits 1pt inside the outer container so the border
	// gradient peeks through evenly on all four sides.
	const innerRadius = radiusPt - 1

	// `className` lands on the inner content view — layout classes like
	// `flex-row` / `gap-3` apply to children, not the gradient frame.
	// External margin / positioning belongs on a parent wrapper.
	return (
		<Container
			ref={ref as never}
			{...interactiveProps}
			style={[{ borderRadius: radiusPt, padding: 1 }, isInteractive ? press.animatedStyle : null]}
			{...rest}
		>
			<LinearGradient
				colors={[...stops.border] as [string, string]}
				start={{ x: 0, y: 0 }}
				end={{ x: 0, y: 1 }}
				style={[StyleSheet.absoluteFill, { borderRadius: radiusPt }]}
				pointerEvents="none"
			/>
			<View
				style={{
					borderRadius: innerRadius,
					backgroundColor: stops.surface,
					overflow: 'hidden',
				}}
			>
				<View className={cn(paddingClass, className)}>{children}</View>
			</View>
		</Container>
	)
})
