import { Image, type ImageProps } from 'react-native'

interface LogoMarkProps extends Omit<ImageProps, 'source'> {
	/** Visual size in points. Defaults to 26 to read clearly inside the iOS nav bar. */
	size?: number
}

/**
 * App logo mark — the white wordmark/glyph asset.
 * Used as `headerLeft` on tabs that draw the brand in the nav bar
 * (Pattern B screens — Home, Workout) so the identity stays anchored
 * even when the giant Anton title lives inside scrolling content.
 */
export function LogoMark({ size = 32, style, accessibilityLabel = 'App', ...rest }: LogoMarkProps) {
	return (
		<Image
			source={require('@/assets/logo-mark-white.webp')}
			resizeMode="contain"
			accessibilityLabel={accessibilityLabel}
			style={[{ width: size, height: size }, style]}
			{...rest}
		/>
	)
}
