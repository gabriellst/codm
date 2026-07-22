/**
 * App — Design Tokens (single source of truth)
 *
 * The CodeDM monochrome-light language, mirrored from `global.css` for the
 * native chrome (headers, tab bar, status bar, spinners) that can't read
 * Tailwind classes. Near-white canvas, white surfaces, near-black text, BLACK
 * as the sole action color; status is small colored dots only. Never
 * approximate hex codes inline — reference these.
 */

// ── Colors: surfaces ────────────────────────────────────────────
export const surfaces = {
	bg0: '#F6F6F6', // page background (light-gray canvas)
	bg1: '#FFFFFF', // alternate panel
	surface1: '#FFFFFF', // card
	surface2: '#F2F2F2', // card hover / raised
	surface3: '#ECECEC', // selected / pressed
	overlay: 'rgba(0,0,0,0.4)',
	overlayMedium: 'rgba(0,0,0,0.4)', // camera/sheet half-veil
	overlayDark: 'rgba(0,0,0,0.5)', // sheet backdrop
	// The one dark surface in the app — the terminal-session panel.
	terminal: '#141414',
	terminalText: '#E5E5E5',
	terminalDim: '#8A8A8A',
} as const

// ── Colors: foreground ──────────────────────────────────────────
export const fg = {
	fg0: '#1A1A1A', // primary text / headlines (near-black)
	fg1: '#525252', // body
	fg2: '#7D7D7D', // meta / legal
	fg3: '#B3B3B3', // disabled / strikethrough
} as const

// ── Colors: borders ─────────────────────────────────────────────
export const border = {
	borderMinimal: 'rgba(0,0,0,0.04)', // hairline
	borderSubtle: 'rgba(0,0,0,0.06)', // dim card edge
	border: '#E5E5E5', // standard
	borderStrong: 'rgba(0,0,0,0.16)', // pronounced
	borderLight: 'rgba(0,0,0,0.10)', // gradient stops, accents
	borderMedium: 'rgba(0,0,0,0.12)', // empty-state dotted
	borderHeavy: 'rgba(0,0,0,0.30)', // dashed draft row
	borderFocus: 'rgba(26,26,26,0.85)',
} as const

// ── Colors: action (the ONE color) ──────────────────────────────
// Black is the sole action color; white sits on top of it. Used for
// lucide glyphs rendered inside black chips/badges/buttons (React Native
// SVG icons take a color prop, not a Tailwind class).
export const action = {
	primary: '#111111',
	onPrimary: '#FFFFFF',
} as const

// ── Colors: accents ─────────────────────────────────────────────
export const accent = {
	cashback: '#16A34A',
	cashbackBg: 'rgba(22,163,74,0.12)',
	promo: '#F4F4F5',
	danger: '#DC2626',
	// Used in screens for status colors (small dots)
	success: '#16A34A',
	successBg: 'rgba(22,163,74,0.12)',
	warning: '#D97706',
	warningBg: 'rgba(217,119,6,0.12)',
	warningBorder: 'rgba(217,119,6,0.4)',
	info: '#2563EB',
	alert: '#D97706',
	loss: '#DC2626',
	pulse: '#DC2626',
	iosRed: '#FF3B30', // iOS system destructive red (sign-out, badges)
	successBorder: 'rgba(22,163,74,0.4)',
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
