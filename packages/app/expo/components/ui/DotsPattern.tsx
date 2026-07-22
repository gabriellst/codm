// TEMP: SkSL halftone-dots overlay disabled while measuring whether
// per-frame Skia shader work is hurting performance. Stub returns null
// so all consumers keep working. Swap the `STUB` and `ORIGINAL` blocks
// below to restore the real shader.

interface DotsPatternProps {
	/** Distance between dot centers in points. Default 7. */
	spacing?: number
	/** Overall overlay opacity multiplier (0..1). Default 1. */
	strength?: number
}

// ===== STUB (active) =====
export function DotsPattern(_props: DotsPatternProps) {
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
uniform float strength;

const float CYCLE = 14.0;
const float PHASE_MIN = -0.3;
const float PHASE_MAX = 1.3;
const float SIGMA = 0.13;

float ripple(float coord, float t) {
  float p = mix(PHASE_MIN, PHASE_MAX, t);
  float d = (coord - p) / SIGMA;
  return exp(-d * d);
}

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / resolution;
  float2 local = mod(fragCoord, spacing) - spacing * 0.5;
  float d = length(local);
  float vfade = mix(1.0, 0.35, uv.y);
  float r = spacing * 0.18 * vfade;
  float dotMask = 1.0 - smoothstep(r - 1.0, r, d);
  float baseAlpha = dotMask * 0.06;
  float sweepCoord = uv.x;
  float t = mod(time / CYCLE, 1.0);
  float w0 = ripple(sweepCoord, t);
  float w1 = ripple(sweepCoord, mod(t + 0.33, 1.0));
  float w2 = ripple(sweepCoord, mod(t + 0.67, 1.0));
  float sweep = (w0 + w1 * 0.65 + w2 * 0.45) * 0.5;
  float glint = dotMask * sweep * 0.28;
  float a = (baseAlpha + glint) * strength;
  return half4(half3(a), half(a));
}
`

const compiled = Skia.RuntimeEffect.Make(SHADER_SOURCE)
if (!compiled) throw new Error('Failed to compile dots SkSL shader')
const effect = compiled

export function DotsPattern({ spacing = 7, strength = 1 }: DotsPatternProps) {
	const { width, height } = useWindowDimensions()
	const clock = useClock()
	const uniforms = useDerivedValue(
		() => ({
			resolution: [width, height] as [number, number],
			time: clock.value / 1000,
			spacing,
			strength,
		}),
		[width, height, spacing, strength],
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
