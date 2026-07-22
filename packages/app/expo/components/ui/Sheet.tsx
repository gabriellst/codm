import { useEffect, useRef } from 'react'
import { Animated, Dimensions, Modal, Pressable, StyleSheet, View } from 'react-native'
import { cva, type VariantProps } from 'class-variance-authority'
import { LinearGradient } from 'expo-linear-gradient'
import { cn } from '@/lib/utils'
import { surfaces, fg, iconSize } from '@/lib/tokens'
import { DisplayTitle } from './DisplayTitle'
import { IconClose } from './Icons'

const sheetVariants = cva('absolute left-0 right-0 bottom-0 px-5 pb-7 pt-2.5 rounded-t-xl border-t border-white/[0.16] overflow-hidden', {
	variants: {
		size: {
			auto: '',
			tall: 'h-[560px]',
			full: 'h-[80%]',
		},
	},
	defaultVariants: { size: 'auto' },
})

interface SheetProps extends VariantProps<typeof sheetVariants> {
	open: boolean
	onClose: () => void
	title?: string
	children?: React.ReactNode
	/** Shorthand override — `auto` lets content size; pass a number (in points) to clamp. */
	height?: number | 'auto' | 'tall' | 'full'
	className?: string
}

const SCREEN_HEIGHT = Dimensions.get('window').height

/**
 * Sheet — bottom-sheet modal. className-driven internals; preserves the
 * same public API as the legacy implementation.
 */
export function Sheet({ open, onClose, title, children, size, height, className }: SheetProps) {
	const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current
	const overlayOpacity = useRef(new Animated.Value(0)).current

	useEffect(() => {
		if (open) {
			Animated.parallel([
				Animated.timing(translateY, { toValue: 0, duration: 320, useNativeDriver: true }),
				Animated.timing(overlayOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
			]).start()
		} else {
			Animated.parallel([
				Animated.timing(translateY, { toValue: SCREEN_HEIGHT, duration: 240, useNativeDriver: true }),
				Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
			]).start()
		}
	}, [open, translateY, overlayOpacity])

	// Resolve precedence: numeric height (legacy escape hatch) → size variant → auto.
	const numericHeight = typeof height === 'number' ? height : undefined
	const resolvedSize = (typeof height === 'string' ? height : undefined) ?? size
	const maxHeight = SCREEN_HEIGHT * 0.78

	return (
		<Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
			<View style={StyleSheet.absoluteFill}>
				<Animated.View style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]}>
					<Pressable className="flex-1 bg-black/60" onPress={onClose} accessibilityLabel="Fechar" />
				</Animated.View>

				<Animated.View
					className={cn(sheetVariants({ size: resolvedSize ?? 'auto' }), className)}
					style={[
						numericHeight ? { height: numericHeight } : { maxHeight },
						{ transform: [{ translateY }] },
						// Heavy shadow — Tailwind doesn't express upward shadow direction.
						{
							shadowColor: '#000',
							shadowOffset: { width: 0, height: -20 },
							shadowOpacity: 0.6,
							shadowRadius: 60,
						},
					]}
				>
					<LinearGradient
						colors={[surfaces.surface2, surfaces.bg0]}
						start={{ x: 0.5, y: 0 }}
						end={{ x: 0.5, y: 1 }}
						style={StyleSheet.absoluteFill}
					/>
					<View className="w-10 h-1 rounded-md bg-white/20 self-center mb-3.5" />
					{title ? (
						<View className="flex-row items-center justify-between mb-4">
							<DisplayTitle fontSize={28}>{title}</DisplayTitle>
							<Pressable onPress={onClose} accessibilityLabel="Fechar" hitSlop={10}>
								<IconClose size={iconSize.xl} color={fg.fg0} />
							</Pressable>
						</View>
					) : null}
					<View className="flex-1">{children}</View>
				</Animated.View>
			</View>
		</Modal>
	)
}
