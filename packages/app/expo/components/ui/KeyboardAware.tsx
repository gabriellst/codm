import { Keyboard, KeyboardAvoidingView, Platform, Pressable, View, type KeyboardAvoidingViewProps } from 'react-native'

type KeyboardAwareProps = Omit<KeyboardAvoidingViewProps, 'behavior'> & {
	/**
	 * Optional override. Defaults to `padding` on iOS and `height` on
	 * Android — the combination that keeps the content above the keyboard
	 * across the screens we use this on (active-exercise editor, form
	 * sheets) without the layout-shift quirks of `position`.
	 */
	behavior?: KeyboardAvoidingViewProps['behavior']
	/** Optional vertical offset (e.g. tab bar / header height to subtract). */
	keyboardVerticalOffset?: number
	/**
	 * If true (default), tapping any non-interactive area inside the
	 * wrapper dismisses the keyboard. A `<Pressable onPress={...}>`
	 * wrapper only fires when no descendant responder (TextInput,
	 * Button, Pressable row, etc.) claims the touch first — so taps on
	 * inputs keep them focused and taps on empty space dismiss.
	 */
	dismissOnTap?: boolean
}

/**
 * Thin wrapper around `KeyboardAvoidingView` that flexes to fill its
 * parent and picks platform-appropriate `behavior` defaults. Drop it
 * around screen content that hosts `TextInput` / `NumField` to keep
 * the focused field visible above the on-screen keyboard, and to
 * dismiss the keyboard on a tap anywhere outside the field.
 *
 * Important: any padding/margin you pass via `style` is applied to an
 * inner View, NOT to the `KeyboardAvoidingView`. KAV with
 * `behavior="padding"` owns its own `paddingBottom` dynamically — a
 * fixed `paddingBottom` on the same element fights with that
 * adjustment and ends up clipping bottom-aligned content.
 */
export function KeyboardAware({ behavior, style, children, keyboardVerticalOffset, dismissOnTap = true, ...rest }: KeyboardAwareProps) {
	const Inner = dismissOnTap ? Pressable : View
	const innerProps = dismissOnTap ? { onPress: Keyboard.dismiss, accessible: false as const } : {}

	return (
		<KeyboardAvoidingView
			behavior={behavior ?? (Platform.OS === 'ios' ? 'padding' : 'height')}
			keyboardVerticalOffset={keyboardVerticalOffset}
			style={{ flex: 1 }}
			{...rest}
		>
			{/* Pressable's `onPress` only fires when no descendant
			    responder (TextInput, Button, Pressable row, etc.) consumed
			    the touch. So:
			      • tap input → input keeps focus, keyboard stays
			      • tap button → button fires its onPress, keyboard stays
			      • tap empty space → this Pressable fires → Keyboard.dismiss
			    Previously this used `onStartShouldSetResponderCapture` to
			    fire on every touch, which made tapping an input briefly
			    blur it before it re-focused — causing a visible keyboard
			    flicker. */}
			<Inner style={[{ flex: 1 }, style]} {...innerProps}>
				{children}
			</Inner>
		</KeyboardAvoidingView>
	)
}
