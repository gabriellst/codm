import Svg, { Path, Circle, Line, Polyline, Rect } from 'react-native-svg'
import type { ColorValue } from 'react-native'

export interface IconProps {
	size?: number
	color?: ColorValue
	stroke?: number
}

const baseProps = (size: number, color: ColorValue, stroke: number) => ({
	width: size,
	height: size,
	viewBox: '0 0 24 24',
	fill: 'none' as const,
	stroke: color,
	strokeWidth: stroke,
	strokeLinecap: 'round' as const,
	strokeLinejoin: 'round' as const,
})

const make = (body: React.ReactNode): React.FC<IconProps> => {
	const Component = ({ size = 20, color = '#fff', stroke = 1.75 }: IconProps) => <Svg {...baseProps(size, color, stroke)}>{body}</Svg>
	return Component
}

export const IconHome = make(<Path d="M3 11l9-8 9 8M5 10v10h4v-6h6v6h4V10" />)

export const IconBolt = make(<Path d="M13 2L4 14h7l-1 8 9-12h-7z" />)

export const IconChart = make(<Path d="M3 21h18M7 17V9M12 17V5M17 17v-6" />)

export const IconUser = make(
	<>
		<Circle cx="12" cy="8" r="4" />
		<Path d="M4 21a8 8 0 0 1 16 0" />
	</>,
)

export const IconPlus = make(<Path d="M12 5v14M5 12h14" />)

export const IconCheck = make(<Polyline points="20 6 9 17 4 12" />)

export const IconClose = make(
	<>
		<Line x1="18" y1="6" x2="6" y2="18" />
		<Line x1="6" y1="6" x2="18" y2="18" />
	</>,
)

export const IconBack = make(<Polyline points="15 18 9 12 15 6" />)

export const IconSearch = make(
	<>
		<Circle cx="11" cy="11" r="7" />
		<Line x1="21" y1="21" x2="16.65" y2="16.65" />
	</>,
)

export const IconMenu = make(
	<>
		<Line x1="3" y1="6" x2="21" y2="6" />
		<Line x1="3" y1="12" x2="21" y2="12" />
		<Line x1="3" y1="18" x2="21" y2="18" />
	</>,
)

export const IconFlame = make(<Path d="M12 2s5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 1-3s2 2 3 0c1-3-2-5 1-7z" />)

export const IconTrophy = make(
	<>
		<Path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0z" />
		<Path d="M5 4H3v2a3 3 0 0 0 3 3M19 4h2v2a3 3 0 0 1-3 3" />
	</>,
)

export const IconClock = make(
	<>
		<Circle cx="12" cy="12" r="9" />
		<Polyline points="12 7 12 12 15 14" />
	</>,
)

export const IconChevron = make(<Polyline points="9 18 15 12 9 6" />)

export const IconCalendar = make(
	<>
		<Rect x="3" y="4" width="18" height="18" rx="2" />
		<Line x1="16" y1="2" x2="16" y2="6" />
		<Line x1="8" y1="2" x2="8" y2="6" />
		<Line x1="3" y1="10" x2="21" y2="10" />
	</>,
)

export const IconTrend = make(
	<>
		<Polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
		<Polyline points="16 7 22 7 22 13" />
	</>,
)

export const IconDumb = make(<Path d="M6 4v16M18 4v16M2 8v8M22 8v8M6 12h12" />)

export const IconPencil = make(
	<>
		<Path d="M12 20h9" />
		<Path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4z" />
	</>,
)

export const IconTrash = make(
	<>
		<Polyline points="3 6 5 6 21 6" />
		<Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
		<Line x1="10" y1="11" x2="10" y2="17" />
		<Line x1="14" y1="11" x2="14" y2="17" />
	</>,
)

export const IconPause = make(
	<>
		<Rect x="6" y="4" width="4" height="16" rx="1" />
		<Rect x="14" y="4" width="4" height="16" rx="1" />
	</>,
)

export const IconPlay = make(<Path d="M8 5v14l11-7z" />)

export const IconStopwatch = make(
	<>
		<Line x1="10" y1="2" x2="14" y2="2" />
		<Line x1="12" y1="14" x2="15" y2="11" />
		<Path d="M5 14a7 7 0 1 0 14 0 7 7 0 0 0-14 0z" />
	</>,
)

export const IconHeart = make(
	<Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />,
)

export const IconQRCode = make(
	<>
		<Rect x="3" y="3" width="7" height="7" rx="0.5" />
		<Rect x="14" y="3" width="7" height="7" rx="0.5" />
		<Rect x="3" y="14" width="7" height="7" rx="0.5" />
		<Path d="M14 14h3v3h-3zM18 14h3M14 18h3v3M21 18v3" />
	</>,
)
