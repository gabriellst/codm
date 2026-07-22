import { LinearGradient, type LinearGradientProps } from 'expo-linear-gradient'
import type { ReactNode } from 'react'
import type { ViewStyle } from 'react-native'

type Stops = readonly [string, string, ...string[]]

type GradientBoxProps = {
	/** Fill gradient stops (top → bottom by default). */
	fill?: Stops
	/** Border-ring gradient stops. Omit for no gradient border. */
	border?: Stops
	/** Border ring thickness in px (web utility uses 1px). */
	borderWidth?: number
	/** Corner radius in px. */
	radius?: number
	style?: ViewStyle
	children?: ReactNode
} & Pick<LinearGradientProps, 'start' | 'end'>

const TRANSPARENT = ['transparent', 'transparent'] as const satisfies Stops

/**
 * Native equivalent of the web `gradient-box` utility.
 *
 * The CSS utility (background-clip / multi-layer background-image / @property)
 * has NO React Native equivalent, so on expo the same effect is a component:
 * an outer LinearGradient acts as the gradient *border ring* (revealed by
 * `borderWidth` padding) wrapping an inner LinearGradient *fill* that holds the
 * content. Colors are explicit stops (not Tailwind classes) — typically derived
 * from the shared tokens via the RN color you map them to.
 *
 *   <GradientBox fill={[c1, c2]} border={[c3, c4]}>…</GradientBox>
 */
export function GradientBox({
	fill = TRANSPARENT,
	border = TRANSPARENT,
	borderWidth = 1,
	radius = 12,
	start,
	end,
	style,
	children,
}: GradientBoxProps) {
	return (
		<LinearGradient colors={border} start={start} end={end} style={[{ borderRadius: radius, padding: borderWidth }, style]}>
			<LinearGradient
				colors={fill}
				start={start}
				end={end}
				style={{ flex: 1, borderRadius: radius - borderWidth, overflow: 'hidden' }}
			>
				{children}
			</LinearGradient>
		</LinearGradient>
	)
}
