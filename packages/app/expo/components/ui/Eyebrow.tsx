import { Text, type TextProps, type TextStyle } from 'react-native'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { letterSpacingPt } from '@/lib/tokens'

/**
 * Eyebrow — small uppercase label that titles a section (e.g. "✦ TREINO DE HOJE").
 * className-driven baseline; `trackingEm` + `size` props remain for callers
 * that need precise letterSpacing in points (RN can't compute em natively).
 */
const eyebrowVariants = cva('font-sans-bold uppercase', {
	variants: {
		tracking: {
			default: 'tracking-eyebrow',
			tight: 'tracking-pill',
			wide: 'tracking-hard',
		},
		tone: {
			muted: 'text-foreground-subtle',
			strong: 'text-foreground',
		},
	},
	defaultVariants: { tracking: 'default', tone: 'muted' },
})

interface EyebrowProps extends Omit<TextProps, 'style'>, VariantProps<typeof eyebrowVariants> {
	children: React.ReactNode
	className?: string
	/** Optional escape hatch — when set, overrides the className-based color. */
	color?: string
	/** Font size in points. Default 10.5. */
	size?: number
	/**
	 * em-equivalent letter spacing as points (RN only).
	 * Defaults to 0.18em (eyebrow). Use 0.22em for "hard" tracking, 0.08em for pill.
	 */
	trackingEm?: number
}

export function Eyebrow({ className, children, tracking, tone, color, size = 10.5, trackingEm, ...rest }: EyebrowProps) {
	// Resolve em letter-spacing in points; fall back to the className `tracking-*` token.
	const style: TextStyle = {
		fontSize: size,
		...(color ? { color } : {}),
		...(trackingEm !== undefined ? { letterSpacing: letterSpacingPt(trackingEm, size) } : {}),
	}
	return (
		<Text {...rest} data-slot="eyebrow" className={cn(eyebrowVariants({ tracking, tone }), className)} style={style}>
			{children}
		</Text>
	)
}
