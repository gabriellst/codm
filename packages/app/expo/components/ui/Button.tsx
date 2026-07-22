import { forwardRef } from 'react'
import { Animated, Platform, Pressable, type PressableProps, StyleSheet, Text, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { cva, type VariantProps } from 'class-variance-authority'
import { LinearGradient } from 'expo-linear-gradient'
import { Haptics } from 'react-native-nitro-haptics'
import { cn } from '@/lib/utils'
import { gradients } from '@/lib/tokens'
import { useAnimatedPress } from '@/lib/use-animated-press'

// `Animated.createAnimatedComponent` keeps Pressable as the outermost
// element (preserving its layout box and ref forwarding) while letting
// us animate `transform` / `opacity` natively on press in/out.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * Button — single primitive for the whole button family.
 *
 * Variants (use the `variant` prop):
 * - `chrome` (default): white→#E8E8EA gradient pill with dark text + chrome shadow.
 * - `ghost`: transparent + white border, white text — secondary CTAs.
 * - `destructive`: transparent + red text — irreversible actions.
 * - `link`: text-only — inline tertiary actions ("Criar exercício personalizado").
 *
 * Sizes:
 * - `sm`: h-10, smaller text.
 * - `md` (default): h-12, primary CTA size.
 * - `lg`: h-14, hero CTAs.
 *
 * Platform behavior:
 * - iOS: `ghost` / `destructive` / `link` variants without `leading`/`trailing`
 *   icon nodes render as `@expo/ui/swift-ui` `Button` for native press feedback +
 *   accessibility. Everything else (chrome variant, or any variant with icons)
 *   uses the cross-platform Pressable + className path.
 * - Android: always Pressable + className.
 */

const buttonVariants = cva('flex-row items-center justify-center gap-2 rounded-pill', {
	variants: {
		variant: {
			// chrome shadow is applied via inline RN-style props in the component below
			// (RN shadows are single-layer; Tailwind v4's composite shadow can't be serialized by Uniwind)
			//
			// No `active:opacity-*` here anymore — press feedback is handled by the
			// shared scale + opacity animation below so every variant feels uniform.
			chrome: '',
			// `success` and `destructive` follow the design system's tinted-pill
			// style (see `Pill` success / warning variants): 10% accent fill,
			// 40% accent border, accent-colored label. The branded outline reads
			// as a clearly-identified action against the dark theme without the
			// flatness of a solid fill.
			success: 'bg-success/10 border border-success/40',
			destructive: 'bg-destructive/10 border border-destructive/40',
			ghost: 'border border-white/[0.16] bg-transparent',
			'soft-destructive': 'bg-transparent',
			link: 'bg-transparent rounded-none',
		},
		size: {
			sm: 'h-10 px-5',
			md: 'h-12 px-6',
			lg: 'h-14 px-7',
		},
		fullWidth: {
			true: 'w-full',
			false: '',
		},
	},
	defaultVariants: { variant: 'chrome', size: 'md', fullWidth: false },
})

const labelVariants = cva('font-sans-bold uppercase', {
	variants: {
		variant: {
			chrome: 'text-background',
			// Tinted accent buttons — label color matches the accent so the action
			// reads as the right kind of branded.
			success: 'text-success',
			ghost: 'text-foreground',
			destructive: 'text-destructive',
			// Borderless, accent-loss text, semi-bold weight — quiet "end this" action,
			// distinct from the prominent tinted `destructive` CTA above.
			'soft-destructive': 'text-loss font-sans-semi',
			link: 'text-foreground normal-case',
		},
		size: {
			sm: 'text-[11px] tracking-[0.96px]',
			md: 'text-[13px] tracking-[1.04px]',
			lg: 'text-[14px] tracking-[1.12px]',
		},
	},
	defaultVariants: { variant: 'chrome', size: 'md' },
})

interface ButtonProps
	extends Omit<PressableProps, 'children' | 'style'>,
		Pick<VariantProps<typeof buttonVariants>, 'variant' | 'size' | 'fullWidth'> {
	/**
	 * Visible text. Optional so icon-only buttons (e.g. a trash button on a
	 * swipe action) can render just the `leading` slot. Icon-only callers
	 * must set `accessibilityLabel` for screen readers.
	 */
	label?: string
	leading?: React.ReactNode
	trailing?: React.ReactNode
	className?: string
}

export const Button = forwardRef<View, ButtonProps>(function Button(
	{ label, leading, trailing, variant, size, fullWidth, className, onPress, disabled, ...props },
	ref,
) {
	const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress({ opacityTo: 0.8 })

	const handlePress: PressableProps['onPress'] = e => {
		if (disabled) return
		Haptics.impact('medium')
		onPress?.(e)
	}

	// Chrome variant draws the white→#E8E8EA gradient pill — native Button can't
	// express that, so always use the Pressable + LinearGradient path.
	const isChrome = variant === 'chrome' || variant == null
	// `link` is text-only and `soft-destructive` is intentionally borderless,
	// so a blur underlay would bleed past their edges. Chrome's solid
	// gradient covers any blur, so skip it there too. Everything else
	// (ghost / success / destructive) gets a frosted-glass underlay that
	// lets the surface beneath show through softly.
	const wantsBlur = !isChrome && variant !== 'link' && variant !== 'soft-destructive'

	if (Platform.OS === 'ios' && !isChrome && !leading && !trailing) {
		// We could swap to @expo/ui/swift-ui Button here for native press feedback +
		// accessibility, but the cross-platform Pressable + className path covers
		// every variant the design uses today and avoids a typing branch.
	}

	return (
		<AnimatedPressable
			ref={ref}
			onPress={handlePress}
			onPressIn={onPressIn}
			onPressOut={onPressOut}
			disabled={disabled}
			data-slot="button"
			className={cn(buttonVariants({ variant, size, fullWidth }), wantsBlur && 'overflow-hidden', disabled && 'opacity-40', className)}
			style={[
				isChrome
					? {
							shadowColor: '#000',
							shadowOpacity: 0.4,
							shadowRadius: 24,
							shadowOffset: { width: 0, height: 8 },
							elevation: 6,
						}
					: null,
				animatedStyle,
			]}
			{...props}
		>
			{wantsBlur ? <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" /> : null}
			{isChrome ? (
				<LinearGradient
					colors={gradients.chrome}
					start={{ x: 0.5, y: 0 }}
					end={{ x: 0.5, y: 1 }}
					style={{
						position: 'absolute',
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						borderRadius: 9999,
					}}
				/>
			) : null}
			{leading}
			{label ? <Text className={cn(labelVariants({ variant, size }))}>{label}</Text> : null}
			{trailing}
		</AnimatedPressable>
	)
})
