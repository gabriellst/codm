import { StripePattern } from '@/components/ui/StripePattern'

interface CrosshatchPatternProps {
	/** Distance between adjacent lines in points. Default 14 (denser than the stripe variant). */
	spacing?: number
	/** Line thickness in points. Default 1. */
	thickness?: number
	/** Overall overlay opacity multiplier (0..1). Default 0.55 — crosshatch
	 * doubles the line coverage vs. stripe, so we dim it to keep parity. */
	strength?: number
}

/**
 * 45° crosshatch overlay (`/` and `\` lines crossing) backed by the same
 * SkSL shader as `StripePattern`. Includes the animated specular sweep.
 */
export function CrosshatchPattern({ spacing = 6, thickness = 1, strength = 0.55 }: CrosshatchPatternProps) {
	return <StripePattern mode="crosshatch" spacing={spacing} thickness={thickness} strength={strength} />
}
