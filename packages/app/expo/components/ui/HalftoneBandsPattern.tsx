// TEMP: SkSL halftone-band overlay disabled while measuring whether
// per-frame Skia shader work is hurting performance. Stub returns null
// so all consumers keep working. Swap the `STUB` and `ORIGINAL` blocks
// to restore the real shader.

interface HalftoneBandsPatternProps {
	/** Overall overlay opacity multiplier (0..1). Default 1. */
	strength?: number
}

// ===== STUB (active) =====
export function HalftoneBandsPattern(_props: HalftoneBandsPatternProps) {
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
uniform float strength;

const float SQRT2 = 1.41421356;
const float BAND_WIDTH = 140.0;
const float DOT_SPACING = 6.0;

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
  float perp = (fragCoord.x + fragCoord.y) / SQRT2;
  float bandIdx = floor(perp / BAND_WIDTH);
  float inBand = perp - bandIdx * BAND_WIDTH;
  float bandActive = mod(bandIdx, 2.0);
  float bandPos = inBand / BAND_WIDTH;
  float density = 1.0 - abs(bandPos - 0.5) * 2.0;
  density = smoothstep(0.0, 0.7, density) * bandActive;
  float2 cellLocal = mod(fragCoord, DOT_SPACING) - DOT_SPACING * 0.5;
  float cellD = length(cellLocal);
  float maxR = DOT_SPACING * 0.42;
  float r = maxR * density;
  float dotMask = 1.0 - smoothstep(r - 0.5, r, cellD)
  float baseAlpha = dotMask * 0.05;
  float t = mod(time / CYCLE, 1.0);
  float w0 = ripple(uv.x, t);
  float w1 = ripple(uv.x, mod(t + 0.33, 1.0));
  float w2 = ripple(uv.x, mod(t + 0.67, 1.0));
  float sweep = (w0 + w1 * 0.65 + w2 * 0.45) * 0.5;
  float glint = dotMask * sweep * 0.25;
  float a = (baseAlpha + glint) * strength;
  return half4(half3(a), half(a));
}
`

const compiled = Skia.RuntimeEffect.Make(SHADER_SOURCE)
if (!compiled) throw new Error('Failed to compile halftone-bands SkSL shader')
const effect = compiled

export function HalftoneBandsPattern({ strength = 1 }: HalftoneBandsPatternProps) {
	const { width, height } = useWindowDimensions()
	const clock = useClock()
	const uniforms = useDerivedValue(
		() => ({
			resolution: [width, height] as [number, number],
			time: clock.value / 1000,
			strength,
		}),
		[width, height, strength],
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
