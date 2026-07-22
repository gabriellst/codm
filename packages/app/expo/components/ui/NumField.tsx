import { useEffect, useMemo, useState } from 'react'
import { Platform, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { Haptics } from 'react-native-nitro-haptics'
import { NitroModules } from 'react-native-nitro-modules'
import { runOnJS } from 'react-native-reanimated'
import { Button as SwiftUIButton, Host } from '@expo/ui/swift-ui'
import { font, foregroundStyle, frame, glassEffect, labelStyle, tint } from '@expo/ui/swift-ui/modifiers'
import { Input } from '@/components/ui/Input'
import { textInputStyle } from '@/lib/text-styles'
import { cn } from '@/lib/utils'
import { letterSpacingPt, fg, fs } from '@/lib/tokens'

interface NumFieldProps {
	label: string
	value: number
	onChange: (next: number) => void
	step?: number
	min?: number
	max?: number
	className?: string
}

/**
 * NumField — stepper input for reps/kg.
 *
 * Cross-platform: uses RN `<Input>` (which is a `UITextField` underneath
 * on iOS) on both platforms. We previously had an iOS-specific SwiftUI
 * `TextField` path, but its `<Host matchContents>` had a focus-state
 * jitter that visually shifted the digit upward relative to a sibling
 * NumField — and SwiftUI's `@FocusState` doesn't respond to
 * `Keyboard.dismiss()`, which had forced us to maintain a custom focus
 * tracker. Dropping the SwiftUI path eliminates both problems.
 *
 * The stepper buttons (+/−) are still SwiftUI `Button`s on iOS — that
 * gives us the iOS 26 `.glass` style without any text-rendering quirks.
 */
export function NumField({ label, value, onChange, step = 1, min = 0, max, className }: NumFieldProps) {
	// Internal text state separate from the numeric `value` prop so the user
	// can type intermediate states like "8." or "8.5" while the parsed
	// numeric is still 8 / 8.5. Synced from `value` whenever the parsed
	// numeric of the current text doesn't match — covers `form.reset()`
	// without clobbering mid-typing input.
	const [text, setText] = useState<string>(String(value))
	useEffect(() => {
		setText(prev => {
			const parsed = Number(prev.replace(',', '.'))
			return Number.isNaN(parsed) || parsed !== value ? String(value) : prev
		})
	}, [value])

	const dec = () => {
		const next = Math.max(min, value - step)
		onChange(next)
		setText(String(next))
	}
	const inc = () => {
		const next = max != null ? Math.min(max, value + step) : value + step
		onChange(next)
		setText(String(next))
	}
	const handleText = (raw: string) => {
		setText(raw)
		const parsed = Number(raw.replace(',', '.'))
		if (!Number.isNaN(parsed)) onChange(parsed)
	}

	return (
		<View className={cn('items-center', className)}>
			<Text
				className="text-foreground-subtle font-sans-bold uppercase mb-2"
				style={{ fontSize: fs.micro, letterSpacing: letterSpacingPt(0.22, fs.micro) }}
			>
				{label}
			</Text>
			<View className="flex-row items-center justify-center gap-3">
				<StepperButton onPress={dec} symbol="−" accessibilityLabel={`Diminuir ${label}`} />
				<Input
					value={text}
					onChangeText={handleText}
					keyboardType="decimal-pad"
					inputMode="decimal"
					selectTextOnFocus
					className="min-w-[60px] text-center font-sans-black"
					style={{
						...textInputStyle(fs.md),
						fontVariant: ['tabular-nums'],
						letterSpacing: -0.2,
					}}
				/>
				<StepperButton onPress={inc} symbol="+" accessibilityLabel={`Aumentar ${label}`} />
			</View>
		</View>
	)
}

interface StepperButtonProps {
	onPress: () => void
	symbol: '−' | '+'
	accessibilityLabel: string
}

/**
 * Stepper button. On iOS uses a real SwiftUI `Button` with the iOS 26
 * `.glass` style — the translucent floating chip Apple uses in Now
 * Playing / Spotlight / Camera. Falls back to `.bordered` automatically
 * on iOS < 26 (SwiftUI does this at the system level).
 *
 * The host gets an explicit width/height — `matchContents` collapses to
 * zero when the SwiftUI Button has only a `systemImage` and no `label`.
 *
 * Android keeps the RN `Pressable` path because there is no equivalent
 * native widget for the glass style.
 */
/**
 * Boxed Haptics module so we can call its native methods directly from a
 * Reanimated worklet (UI thread). Without `NitroModules.box(...)` the
 * worklet can't serialize the host object across the JS/UI boundary.
 */
const boxedHaptics = NitroModules.box(Haptics)

function StepperButton({ onPress, symbol, accessibilityLabel }: StepperButtonProps) {
	// `Gesture.Tap()` runs on the UI thread and fires `onBegin` the moment a
	// touch is detected — bypassing RN `Pressable`'s ~120ms debounce. The
	// nitro-haptics call inside the worklet hits the Taptic Engine via a
	// synchronous JSI binding, so the buzz fires before any JS thread work.
	// The value change still hops back to JS via `runOnJS` on tap end.
	const tap = useMemo(
		() =>
			Gesture.Tap()
				.maxDuration(10_000)
				.onBegin(() => {
					'worklet'
					// UI thread call via the boxed nitro reference — sub-ms,
					// no JS bridge. If you ever feel like nothing's firing, the
					// native module probably isn't linked; rebuild with
					// `bun dev:ios:clean`.
					boxedHaptics.unbox().impact('light')
				})
				.onEnd((_event, success) => {
					'worklet'
					if (success) runOnJS(onPress)()
				}),
		[onPress],
	)

	if (Platform.OS === 'ios') {
		const isPlus = symbol === '+'
		const sfSymbol = isPlus ? 'plus' : 'minus'
		// `minus` SF Symbol is just a horizontal stroke (~16×4 at size 16) while
		// `plus` fills its box (~16×16). Bumping minus's size keeps the visible
		// glyph weight balanced between the two chips.
		const iconSize = isPlus ? 16 : 22
		return (
			// `pointerEvents="box-only"` — the wrapping View captures touches
			// for the GestureDetector while the SwiftUI Button (purely visual)
			// can't compete for the gesture. SwiftUI button has no `onPress`
			// for the same reason.
			<GestureDetector gesture={tap}>
				<View accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={{ width: 44, height: 44 }} pointerEvents="box-only">
					<Host style={{ flex: 1 }}>
						<SwiftUIButton
							label={accessibilityLabel}
							systemImage={sfSymbol}
							modifiers={[
								labelStyle('iconOnly'),
								font({ size: iconSize, weight: 'semibold' }),
								foregroundStyle(fg.fg0),
								tint(fg.fg0),
								frame({ width: 44, height: 44 }),
								glassEffect({ shape: 'capsule', glass: { variant: 'regular', interactive: true } }),
							]}
						/>
					</Host>
				</View>
			</GestureDetector>
		)
	}
	return (
		<GestureDetector gesture={tap}>
			<View
				accessibilityRole="button"
				accessibilityLabel={accessibilityLabel}
				className="w-11 h-11 rounded-pill bg-white/10 items-center justify-center"
			>
				<Text className="text-foreground font-sans-bold text-2xl leading-[24px]">{symbol}</Text>
			</View>
		</GestureDetector>
	)
}
