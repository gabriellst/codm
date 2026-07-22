/**
 * App — Design Tokens (single source of truth)
 *
 * Mirrors `colors_and_type.css` from the visual prototype. Use these
 * values everywhere — never approximate hex codes inline.
 */

// ── Colors: surfaces ────────────────────────────────────────────
export const surfaces = {
	bg0: '#0A0A0B', // page background
	bg1: '#111113', // alternate panel
	surface1: '#16161A', // card
	surface2: '#1B1B1F', // card hover / raised
	surface3: '#232328', // selected / pressed
	overlay: 'rgba(10,10,11,0.72)',
	overlayMedium: 'rgba(0,0,0,0.5)', // camera/sheet half-veil
	overlayDark: 'rgba(0,0,0,0.6)', // sheet backdrop
} as const

// ── Colors: foreground ──────────────────────────────────────────
export const fg = {
	fg0: '#FFFFFF', // primary text / headlines
	fg1: '#B9B9BE', // body
	fg2: '#6F6F76', // meta / legal
	fg3: '#44444A', // disabled / strikethrough
} as const

// ── Colors: borders ─────────────────────────────────────────────
export const border = {
	borderMinimal: 'rgba(255,255,255,0.04)', // hairline
	borderSubtle: 'rgba(255,255,255,0.06)', // dim card edge
	border: 'rgba(255,255,255,0.08)', // standard
	borderStrong: 'rgba(255,255,255,0.16)', // pronounced
	borderLight: 'rgba(255,255,255,0.20)', // gradient stops, accents
	borderMedium: 'rgba(255,255,255,0.22)', // empty-state dotted
	borderHeavy: 'rgba(255,255,255,0.40)', // dashed draft row
	borderFocus: 'rgba(255,255,255,0.85)',
} as const

// ── Colors: accents ─────────────────────────────────────────────
export const accent = {
	cashback: '#16A34A',
	cashbackBg: 'rgba(22,163,74,0.12)',
	promo: '#F4F4F5',
	danger: '#DC2626',
	// Used in screens for status colors
	success: '#4ADE80',
	successBg: 'rgba(74,222,128,0.12)',
	warning: '#F59E0B',
	warningBg: 'rgba(245,158,11,0.12)',
	warningBorder: 'rgba(245,158,11,0.4)',
	alert: '#FBBF24',
	loss: '#E0716C',
	pulse: '#EF4444',
	iosRed: '#FF453A', // iOS system destructive red (sign-out, badges)
	successBorder: 'rgba(74,222,128,0.45)', // mirror warningBorder
} as const

// ── Colors: gradient stops (used as arrays for expo-linear-gradient) ──
export const gradients = {
	chrome: ['#FFFFFF', '#E8E8EA'] as const,
	chromeDark: ['#232328', '#0E0E10'] as const,
	heroBg: ['#2A2A30', '#0A0A0B'] as const,
	heroFade: ['rgba(10,10,11,0)', 'rgba(10,10,11,1)'] as const,
	heroVignette: ['rgba(10,10,11,0)', 'rgba(10,10,11,0.85)'] as const,
	workoutBg: ['#131316', '#0A0A0B', '#08080A'] as const,
	// Login top-glow: subtle white gradient fading to transparent.
	loginGlow: ['rgba(255,255,255,0.08)', 'rgba(0,0,0,0)'] as const,
} as const

// ── Type: families (must match the names registered in expo-font) ──
export const font = {
	display: 'Anton_400Regular',
	// Montserrat variable maps to the closest static weights at runtime
	sans: 'Montserrat_400Regular',
	sansMedium: 'Montserrat_500Medium',
	sansSemi: 'Montserrat_600SemiBold',
	sansBold: 'Montserrat_700Bold',
	sansBlack: 'Montserrat_800ExtraBold',
	// Italic variant
	sansItalic: 'Montserrat_400Regular_Italic',
	mono: 'Menlo',
} as const

// ── Type: scale (in points — RN uses pt, not px, but values map 1:1) ──
export const fs = {
	micro: 9.5, // tab labels, in-pill micro labels
	eyebrow: 12,
	xs: 12,
	sm: 14,
	base: 16,
	md: 18,
	lg: 22,
	xl: 28,
	'2xl': 36,
	'3xl': 48,
	'4xl': 64,
	'5xl': 88,
	// Component-bound sizes that don't fit the t-shirt scale:
	headerTitle: 17, // iOS standard nav title
	headerLarge: 34, // iOS large title
	hero: 56, // Anton hero numbers / titles inside scrolls
	display1: 76, // login mega title
} as const

// ── Type: weights ───────────────────────────────────────────────
export const fw = {
	regular: '400',
	medium: '500',
	semi: '600',
	bold: '700',
	black: '800',
} as const

// ── Type: line heights (multipliers) ────────────────────────────
export const lh = {
	display: 0.95,
	tight: 1.1,
	snug: 1.25,
	normal: 1.45,
} as const

// ── Type: letter-spacing (em → points helper used at the call site) ──
// Note: RN takes letterSpacing in points, not em. Convert with em * fontSize.
export const ls = {
	eyebrow: 0.18,
	display: -0.01,
	headline: 0.02,
	// Used by chrome buttons / eyebrow-on-eyebrow tracking
	pillUpper: 0.08,
	hardUpper: 0.22,
} as const

// Helper: convert an em letter-spacing value to RN points relative to a font size.
export const letterSpacingPt = (em: number, fontSize: number) => em * fontSize

// ── Icon sizes (square pt) ─────────────────────────────────────
export const iconSize = {
	xxs: 11, // stat-card delta indicators
	xs: 12, // small inline chevrons / checks
	sm: 13, // pill leading icons (dumbbell)
	md: 14, // default content / chevron / trend
	lg: 16, // list-row chevrons, button leading
	xl: 22, // close button
} as const

// ── Spacing (8pt grid) ──────────────────────────────────────────
export const space = {
	s1: 4,
	s2: 8,
	s3: 12,
	s4: 16,
	s5: 24,
	s6: 32,
	s7: 48,
	s8: 64,
	s9: 96,
	// Tab-bar clearance for ScrollView contentContainerStyle.paddingBottom
	// on every Pattern A tab screen.
	scrollPadding: 110,
} as const

// ── Radius ─────────────────────────────────────────────────────
export const radius = {
	xs: 4,
	sm: 8,
	md: 12,
	lg: 16,
	xl: 24,
	pill: 9999,
} as const

// ── Shadows (RN-style) ─────────────────────────────────────────
export const shadow = {
	card: {
		shadowColor: '#000',
		shadowOpacity: 0.4,
		shadowRadius: 2,
		shadowOffset: { width: 0, height: 1 },
		elevation: 1,
	},
	pop: {
		shadowColor: '#000',
		shadowOpacity: 0.6,
		shadowRadius: 40,
		shadowOffset: { width: 0, height: 16 },
		elevation: 8,
	},
	chrome: {
		shadowColor: '#000',
		shadowOpacity: 0.4,
		shadowRadius: 24,
		shadowOffset: { width: 0, height: 8 },
		elevation: 6,
	},
} as const

// ── Motion ─────────────────────────────────────────────────────
export const motion = {
	durFast: 120,
	durBase: 200,
	durSlow: 320,
	// Press feedback (useAnimatedPress defaults).
	pressScale: 0.96,
	pressOpacity: 0.85,
	pressDurIn: 90,
	pressDurOut: 140,
	// Login intro / spinner.
	fadeUpDuration: 620,
	fadeUpOffset: 16,
	spinDuration: 3200,
	// Error-handler dedupe windows.
	dedupeMs: 1000,
	// Auto-dismiss for transient overlays.
	autoDismissMs: 1200,
} as const

// ── Convenience exported colors object ─────────────────────────
export const colors = {
	...surfaces,
	...fg,
	...border,
	...accent,
} as const

export type ColorKey = keyof typeof colors
