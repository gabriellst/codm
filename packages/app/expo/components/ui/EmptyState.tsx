import { useState } from 'react'
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import { cn } from '@/lib/utils'
import { surfaces } from '@/lib/tokens'
import { DisplayTitle } from './DisplayTitle'
import { Eyebrow } from './Eyebrow'

interface EmptyStateProps {
	eyebrow?: string
	title: string
	body?: string
	action?: React.ReactNode
	className?: string
}

/** Anton title size used inside the empty-state card (text-3xl ~ 30pt). */
const EMPTY_STATE_TITLE_SIZE = 30

// Card border specs — drawn via SVG because RN's native dotted/dashed
// `borderStyle` clips dashes at every rounded corner. We measure the View
// on layout, then stamp a Rect with the matching corner radius and dash
// pattern so the dots wrap the corners cleanly.
//
// The Rect is fully inset by `STROKE` (one full stroke-width on each side)
// rather than `STROKE / 2`, and the View deliberately does NOT use
// `overflow-hidden` — combining a rounded clip with a stroke whose outer
// half rides the View's edge causes anti-aliased corner dots to disappear
// against the rounded mask. Inset stroke + no clip = corners always render.
const RADIUS = 24
const STROKE = 1
const STROKE_COLOR = 'rgba(255,255,255,0.22)'
/** Short-dash pattern — `2,5` reads as a slightly elongated dot, denser than pure round dots. */
const DOT_PATTERN = '2,5'

/**
 * EmptyState — large illustrative empty card for screens with no data.
 *
 * Shared between the workout tab's "no active workout" state and the
 * history tab's "no sessions yet" state, so the visual language stays
 * consistent: flat surface fill, dotted SVG outline, big Anton title.
 */
export function EmptyState({ eyebrow, title, body, action, className }: EmptyStateProps) {
	const [size, setSize] = useState({ w: 0, h: 0 })

	const handleLayout = (e: LayoutChangeEvent) => {
		const { width, height } = e.nativeEvent.layout
		setSize({ w: width, h: height })
	}

	return (
		<View
			onLayout={handleLayout}
			className={cn('items-center px-4 py-8 gap-2', className)}
			style={{
				backgroundColor: surfaces.surface1,
				borderRadius: RADIUS,
			}}
		>
			{size.w > 0 ? (
				// Explicit `width`/`height` (and matching `viewBox`) are required so
				// react-native-svg uses the View's actual pixel dimensions for the
				// Rect geometry — without them it falls back to a 100×100 internal
				// coordinate space and the dotted stroke gets squashed at the corners.
				<Svg
					width={size.w}
					height={size.h}
					viewBox={`0 0 ${size.w} ${size.h}`}
					style={[StyleSheet.absoluteFill, { width: size.w, height: size.h }]}
					pointerEvents="none"
				>
					<Rect
						x={STROKE}
						y={STROKE}
						width={size.w - STROKE * 2}
						height={size.h - STROKE * 2}
						rx={RADIUS - STROKE}
						ry={RADIUS - STROKE}
						fill="none"
						stroke={STROKE_COLOR}
						strokeWidth={STROKE}
						strokeDasharray={DOT_PATTERN}
					/>
				</Svg>
			) : null}
			{eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
			<DisplayTitle fontSize={EMPTY_STATE_TITLE_SIZE} className="text-center">
				{title}
			</DisplayTitle>
			{body ? (
				<Text className="text-foreground-subtle font-sans text-sm text-center max-w-[260px]" style={{ lineHeight: 20 }}>
					{body}
				</Text>
			) : null}
			{action ? <View className="mt-2 w-full items-center">{action}</View> : null}
		</View>
	)
}
