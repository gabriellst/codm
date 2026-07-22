/**
 * Clip-safe text styles for body / input text rendered through React Native.
 *
 * RN's default lineHeight on iOS is roughly `fontSize * 1.2`, which clips
 * descenders ("g", "j", "p", "q", "y") in `<Text>`. The display/headline
 * counterpart in `components/ui/DisplayTitle.tsx` solves the analogous
 * *ascender* clip for Anton with the same 1.6× multiplier — body text
 * uses the same value here.
 *
 * Inputs are the exception: `<TextInput>` does its own line management and
 * setting a non-zero `lineHeight` causes the cursor + selection rect to
 * jump on iOS. So `textInputStyle` returns `lineHeight: 0` (i.e. "let
 * UIKit decide") via `SAFE_INPUT_LINE_HEIGHT_MULTIPLIER`.
 */

/**
 * Minimum lineHeight multiplier needed to keep body text from clipping
 * descenders on iOS RN. Empirically ≈1.6× — matches the display
 * multiplier used inside `DisplayTitle.tsx`.
 */
export const SAFE_TEXT_LINE_HEIGHT_MULTIPLIER = 1.6

/**
 * Multiplier for `<TextInput>` — kept at 0 so RN/UIKit picks its own
 * line metrics. Setting this above 0 introduces caret jitter and
 * selection-rect misalignment.
 */
export const SAFE_INPUT_LINE_HEIGHT_MULTIPLIER = 0

/**
 * Inline-friendly clip-safe style for `<TextInput>`. Returns a
 * `{ fontSize, lineHeight }` pair where `lineHeight` is 0 so UIKit
 * keeps the caret/selection metrics native.
 *
 *   <TextInput style={textInputStyle(fs.base)} ... />
 */
export function textInputStyle(fontSize: number) {
	return {
		fontSize,
		lineHeight: Math.round(fontSize * SAFE_INPUT_LINE_HEIGHT_MULTIPLIER),
	} as const
}

/**
 * Inline-friendly clip-safe style for body `<Text>`. Returns a
 * `{ fontSize, lineHeight }` pair generous enough for descenders.
 *
 *   <Text style={textBodyStyle(fs.sm)}>{value}</Text>
 */
export function textBodyStyle(fontSize: number) {
	return {
		fontSize,
		lineHeight: Math.round(fontSize * SAFE_TEXT_LINE_HEIGHT_MULTIPLIER),
	} as const
}
