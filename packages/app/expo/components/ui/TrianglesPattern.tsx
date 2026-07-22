// TEMP: SkSL triangle-grid overlay disabled while measuring whether
// per-frame Skia shader work is hurting performance. Stub returns null
// so all consumers keep working. Swap the `STUB` and `ORIGINAL` blocks
// to restore the real shader.

interface TrianglesPatternProps {
	/** Overall overlay opacity multiplier (0..1). Default 1. */
	strength?: number
	/** Direction the lighting (and density fade) runs. Default `horizontal` (L→R). */
	sweep?: 'horizontal' | 'vertical-up' | 'vertical-down'
}

// ===== STUB (active) =====
export function TrianglesPattern(_props: TrianglesPatternProps) {
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
uniform float sweepMode;

const float SQRT2 = 1.41421356;
const float CELL = 16.0;
const float EDGE_THICKNESS = 1.0;

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
  float2 local = mod(fragCoord, CELL);
  float distTop = local.y;
  float distBot = CELL - local.y;
  float distLeft = local.x;
  float distRight = CELL - local.x;
  float distDiag = abs(local.x + local.y - CELL) / SQRT2;
  float minD = min(min(min(distTop, distBot), min(distLeft, distRight)), distDiag);
  float edge = 1.0 - smoothstep(EDGE_THICKNESS - 0.5, EDGE_THICKNESS + 0.5, minD);
  float sweepCoord;
  if (sweepMode < 0.5) {
    sweepCoord = uv.x;
  } else if (sweepMode < 1.5) {
    sweepCoord = 1.0 - uv.y;
  } else {
    sweepCoord = uv.y;
  }
  float fade = 1.0 - smoothstep(0.0, 0.85, sweepCoord);
  fade = pow(fade, 1.2);
  float baseAlpha = edge * fade * 0.06;
  float t = mod(time / CYCLE, 1.0);
  float w0 = ripple(sweepCoord, t);
  float w1 = ripple(sweepCoord, mod(t + 0.33, 1.0));
  float w2 = ripple(sweepCoord, mod(t + 0.67, 1.0));
  float sweep = (w0 + w1 * 0.65 + w2 * 0.45) * 0.5;
  float glint = edge * sweep * 0.27 * fade;
  float a = (baseAlpha + glint) * strength;
  return half4(half3(a), half(a));
}
`

const compiled = Skia.RuntimeEffect.Make(SHADER_SOURCE)
if (!compiled) throw new Error('Failed to compile triangles SkSL shader')
const effect = compiled

export function TrianglesPattern({ strength = 1, sweep = 'horizontal' }: TrianglesPatternProps) {
	const { width, height } = useWindowDimensions()
	const clock = useClock()
	const sweepMode = sweep === 'vertical-up' ? 1 : sweep === 'vertical-down' ? 2 : 0
	const uniforms = useDerivedValue(
		() => ({
			resolution: [width, height] as [number, number],
			time: clock.value / 1000,
			strength,
			sweepMode,
		}),
		[width, height, strength, sweepMode],
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
