// TEMP: SkSL diagonal pinstripe / crosshatch overlay disabled while
// measuring whether per-frame Skia shader work is hurting performance.
// Stub returns null so all consumers (including `CrosshatchPattern`)
// keep working. Swap the `STUB` and `ORIGINAL` blocks to restore.

interface StripePatternProps {
	/** `stripe` draws one diagonal family; `crosshatch` adds the perpendicular one. */
	mode?: 'stripe' | 'crosshatch'
	/** Distance between adjacent lines in points. Default 26. */
	spacing?: number
	/** Line thickness in points. Default 1. */
	thickness?: number
	/** Overall overlay opacity multiplier (0..1). Default 1. */
	strength?: number
}

// ===== STUB (active) =====
export function StripePattern(_props: StripePatternProps) {
	return null
}

// ===== ORIGINAL (disabled) =====
/*
import { StyleSheet, useWindowDimensions } from 'react-native'
import { Canvas, Fill, Shader, Skia, useClock } from '@shopify/react-native-skia'
import { useDerivedValue } from 'react-native-reanimated'

const SHADER_SOURCE = `
uniform float2 resolution;
uniform float time;
uniform float spacing;
uniform float thickness;
uniform float strength;
uniform float crosshatch;

const float SQRT2 = 1.41421356;
const float CYCLE = 22.0;
const float PHASE_MIN = -0.5;
const float PHASE_MAX = 1.9;
const float SIGMA = 0.13;

float hash(float2 p) {
  p = fract(p * float2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float ripple(float coord, float t) {
  float p = mix(PHASE_MIN, PHASE_MAX, t);
  float d = (coord - p) / SIGMA;
  return exp(-d * d);
}

half4 main(float2 fragCoord) {
  float dA = (fragCoord.x + fragCoord.y) / SQRT2;
  float dB = (fragCoord.x - fragCoord.y) / SQRT2;
  float modA = mod(dA, spacing);
  float modB = mod(dB, spacing);
  float distA = min(modA, spacing - modA);
  float distB = min(modB, spacing - modB);
  float halfT = thickness * 0.5;
  float lineA = 1.0 - smoothstep(halfT, halfT + 1.0, distA);
  float lineB = 1.0 - smoothstep(halfT, halfT + 1.0, distB);
  float lines = max(lineA, lineB * crosshatch);
  float baseAlpha = lines * 0.022;
  float2 uv = fragCoord / resolution;
  float sweepCoord = (uv.x + uv.y) / SQRT2;
  float t = mod(time / CYCLE, 1.0);
  float w0 = ripple(sweepCoord, t);
  float w1 = ripple(sweepCoord, mod(t + 0.33, 1.0));
  float w2 = ripple(sweepCoord, mod(t + 0.67, 1.0));
  float sweep = (w0 + w1 * 0.65 + w2 * 0.45) * 0.5;
  float glint = lines * sweep * 0.11;
  float ambient = sweep * 0.004;
  float noise = max(0.0, hash(fragCoord) - 0.5) * 0.03;
  float a = (baseAlpha + glint + ambient + noise) * strength;
  return half4(half3(a), half(a));
}
`

const compiled = Skia.RuntimeEffect.Make(SHADER_SOURCE)
if (!compiled) throw new Error('Failed to compile stripe SkSL shader')
const effect = compiled

export function StripePattern({ mode = 'stripe', spacing = 26, thickness = 1, strength = 1 }: StripePatternProps) {
	const { width, height } = useWindowDimensions()
	const clock = useClock()
	const crosshatchFlag = mode === 'crosshatch' ? 1 : 0
	const uniforms = useDerivedValue(
		() => ({
			resolution: [width, height] as [number, number],
			time: clock.value / 1000,
			spacing,
			thickness,
			strength,
			crosshatch: crosshatchFlag,
		}),
		[width, height, spacing, thickness, strength, crosshatchFlag],
	)

	return (
		<Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
			<Fill>
				<Shader source={effect} uniforms={uniforms} />
			</Fill>
		</Canvas>
	)
}
*/
