import { fg, font, fs } from './tokens'

/**
 * iOS native nav-bar title style. UIKit renders this — line metrics are
 * platform-controlled, so the `DisplayTitle` clip-safe trick (used for
 * RN-rendered Anton headlines) doesn't apply here. Any future tweak to
 * the headline look across screens lands in this object.
 */
export const headerTitleStyle = {
	fontFamily: font.sansBold,
	fontSize: fs.headerTitle,
	color: fg.fg0,
} as const

/**
 * iOS native large-title style — the giant collapsing title on Pattern A
 * tab stacks (history / progress / profile / active-exercise). Anton at
 * fs['2xl']. As above, UIKit owns rendering so we don't have to fight
 * lineHeight here.
 */
export const headerLargeTitleStyle = {
	fontFamily: font.display,
	fontSize: fs['2xl'],
	color: fg.fg0,
} as const
