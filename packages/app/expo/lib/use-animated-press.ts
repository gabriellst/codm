import { useRef } from 'react'
import { Animated } from 'react-native'
import { motion } from './tokens'

interface UseAnimatedPressOptions {
	/** Target scale on press in. Smaller = more pronounced compression. Default `motion.pressScale`. */
	scaleTo?: number
	/** Target opacity on press in. Default `motion.pressOpacity`. */
	opacityTo?: number
	/** Press-in tween duration in ms. Default `motion.pressDurIn`. */
	durationIn?: number
	/** Press-out tween duration in ms. Slightly longer for a relaxed release. Default `motion.pressDurOut`. */
	durationOut?: number
}

/**
 * Shared press-feedback primitive — returns an `animatedStyle` (transform +
 * opacity) and matching `onPressIn` / `onPressOut` handlers that tween the
 * pressable on the native driver. Use it for any tappable surface that
 * should feel like the platform's native button.
 *
 * Usage on a regular Pressable:
 *
 *     const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress()
 *     ...
 *     <Animated.View style={animatedStyle}>
 *       <Pressable onPressIn={onPressIn} onPressOut={onPressOut} onPress={...}>
 *         {content}
 *       </Pressable>
 *     </Animated.View>
 *
 * Usage on an `Animated.createAnimatedComponent(Pressable)`:
 *
 *     <AnimatedPressable
 *       style={animatedStyle}
 *       onPressIn={onPressIn}
 *       onPressOut={onPressOut}
 *     />
 *
 * Haptics are intentionally NOT included — fire `Haptics.impactAsync(...)`
 * inside your own `onPress` so callers can pick a feedback style (or skip
 * it entirely for low-prominence actions).
 */
export function useAnimatedPress({
	scaleTo = motion.pressScale,
	opacityTo = motion.pressOpacity,
	durationIn = motion.pressDurIn,
	durationOut = motion.pressDurOut,
}: UseAnimatedPressOptions = {}) {
	const scale = useRef(new Animated.Value(1)).current
	const opacity = useRef(new Animated.Value(1)).current

	const onPressIn = () => {
		Animated.parallel([
			Animated.timing(scale, { toValue: scaleTo, duration: durationIn, useNativeDriver: true }),
			Animated.timing(opacity, { toValue: opacityTo, duration: durationIn, useNativeDriver: true }),
		]).start()
	}
	const onPressOut = () => {
		Animated.parallel([
			Animated.timing(scale, { toValue: 1, duration: durationOut, useNativeDriver: true }),
			Animated.timing(opacity, { toValue: 1, duration: durationOut, useNativeDriver: true }),
		]).start()
	}

	return {
		animatedStyle: { transform: [{ scale }], opacity },
		onPressIn,
		onPressOut,
	}
}
