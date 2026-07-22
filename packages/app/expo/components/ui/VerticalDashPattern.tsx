// TEMP: SkSL "broken vertical bars" overlay disabled while measuring
// whether per-frame Skia shader work is hurting performance. Stub
// returns null so all consumers keep working. Swap the `STUB` and
// `ORIGINAL` blocks to restore the real shader.

interface VerticalDashPatternProps {
	/** Overall overlay opacity multiplier (0..1). Default 1. */
	strength?: number
}

// ===== STUB (active) =====
export function VerticalDashPattern(_props: VerticalDashPatternProps) {
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

const float COL_SPACING = 11.0;
const float COL_WIDTH = 3.0;
const float DASH_HEIGHT = 7.0;
const float DASH_GAP = 4.0;
const float DASH_TOTAL = DASH_HEIGHT + DASH_GAP;
const float SKEW = 0.16;

const float CYCLE = 14.0;
const float PHASE_MIN = -0.3;
const float PHASE_MAX = 1.3;
const float SIGMA = 0.13;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float ripple(float coord, float t) {
  float p = mix(PHASE_MIN, PHASE_MAX, t);
  float d = (coord - p) / SIGMA;
  return exp(-d * d);
}

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / resolution;
  float xCentered = fragCoord.x - resolution.x * 0.5;
  float2 sFrag = float2(xCentered, fragCoord.y - xCentered * SKEW);
  float colIdx = floor(sFrag.x / COL_SPACING);
  float xInCol = sFrag.x - colIdx * COL_SPACING;
  float colMask = 1.0 - smoothstep(COL_WIDTH - 1.0, COL_WIDTH, xInCol);
  float phase = hash11(colIdx) * DASH_TOTAL;
  float yShifted = sFrag.y + phase;
  float yInDash = mod(yShifted, DASH_TOTAL);
  float yMask = 1.0 - smoothstep(DASH_HEIGHT - 1.0, DASH_HEIGHT, yInDash);
  float dash = colMask * yMask;
  float centerFade = exp(-pow((uv.x - 0.5) * 2.4, 2.0));
  float baseAlpha = dash * 0.045 * centerFade;
  float t = mod(time / CYCLE, 1.0);
  float w0 = ripple(uv.x, t);
  float w1 = ripple(uv.x, mod(t + 0.33, 1.0));
  float w2 = ripple(uv.x, mod(t + 0.67, 1.0));
  float sweep = (w0 + w1 * 0.65 + w2 * 0.45) * 0.5;
  float glint = dash * sweep * 0.25 * centerFade;
  float a = (baseAlpha + glint) * strength;
  return half4(half3(a), half(a));
}
`

const compiled = Skia.RuntimeEffect.Make(SHADER_SOURCE)
if (!compiled) throw new Error('Failed to compile vertical-dash SkSL shader')
const effect = compiled

export function VerticalDashPattern({ strength = 1 }: VerticalDashPatternProps) {
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
