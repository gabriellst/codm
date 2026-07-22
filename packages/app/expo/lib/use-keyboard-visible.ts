import { useEffect, useState } from 'react'
import { Keyboard, Platform } from 'react-native'

/**
 * Tracks whether the on-screen keyboard is currently visible. Use to
 * hide elements that compete with the keyboard for screen real estate
 * (e.g. the rest-timer pill above the SetEditor).
 *
 * iOS uses the `Will*` events for a smoother fade in sync with the
 * keyboard animation; Android only fires `Did*` reliably.
 */
export function useKeyboardVisible(): boolean {
	const [visible, setVisible] = useState(false)

	useEffect(() => {
		const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
		const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
		const showSub = Keyboard.addListener(showEvent, () => setVisible(true))
		const hideSub = Keyboard.addListener(hideEvent, () => setVisible(false))
		return () => {
			showSub.remove()
			hideSub.remove()
		}
	}, [])

	return visible
}
