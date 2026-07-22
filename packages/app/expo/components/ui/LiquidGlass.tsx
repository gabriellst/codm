import { View, type ViewProps, type ViewStyle, StyleSheet } from 'react-native'
import { BlurView } from 'expo-blur'
import { border } from '@/lib/tokens'

interface LiquidGlassProps extends Omit<ViewProps, 'style'> {
	intensity?: number
	style?: ViewStyle | ViewStyle[]
	children?: React.ReactNode
}

/**
 * Liquid-glass surface — translucent dark backdrop with strong blur and
 * saturation. Used by the bottom tab bar and any floating chrome.
 *
 * On iOS 26+ the platform `GlassView` (via @expo/ui) would provide a
 * higher-fidelity material. For now we ship the BlurView fallback.
 *
 * TODO: detect iOS 26+ and prefer @expo/ui GlassView when available.
 */
export function LiquidGlass({ intensity = 80, style, children, ...rest }: LiquidGlassProps) {
	return (
		<View style={[styles.root, style]} {...rest}>
			<BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
			<View style={styles.tint} pointerEvents="none" />
			{children}
		</View>
	)
}

const styles = StyleSheet.create({
	root: {
		overflow: 'hidden',
	},
	tint: {
		...StyleSheet.absoluteFillObject,
		// 45% tint of surfaces.bg0 — RN can't compose alpha onto a hex token at runtime, so this stays inline.
		backgroundColor: 'rgba(10,10,11,0.45)',
		borderTopWidth: 1,
		borderTopColor: border.border,
	},
})
