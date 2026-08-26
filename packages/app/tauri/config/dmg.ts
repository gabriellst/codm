/**
 * DMG install window — the Finder window macOS opens when someone double-clicks the downloaded
 * `.dmg`. Genuine shell decisions (defaults, no repo-fact source): the window size, where the two
 * icons sit, and the picture painted behind them. Two consumers read THIS object:
 *
 *  - `./generate.ts` renders it into `bundle.macOS.dmg` of tauri.conf.json (the bundler passes
 *    every field straight to its create-dmg fork);
 *  - `scripts/og/dmg-background.ts` DRAWS the background from the same coordinates, so the arrow
 *    always lands between the icons Finder places — move an icon here and the picture follows.
 *
 * Coordinates are Finder's: window-content points (origin top-left, title bar excluded) and each
 * position is the CENTER of the icon, not its corner. The bundler fixes icon size 128 and label
 * size 16 in its script (`bundle_dmg`: ICON_SIZE / TEXT_SIZE) — neither is exposed in tauri.conf,
 * so both are mirrored in DMG_FINDER for the drawing to line up with what Finder renders.
 */
export const DMG = {
	/** Relative to src-tauri/ — every path in tauri.conf.json resolves from the dir holding it.
	 *  The file is COMMITTED (rendered by `bun desktop:dmg-background`), like the icons. */
	background: 'dmg/background.png',
	/** Window content size in points. Same aspect as the classic 660×400 install window. */
	windowSize: { width: 660, height: 400 },
	/** Where the window opens on screen. Modest on purpose: a 13" display (1440×900 points) still
	 *  fits the whole window without spilling off the right edge. */
	windowPosition: { x: 200, y: 120 },
	/** Center of the app icon (left) and of the Applications alias (right), same baseline. */
	appPosition: { x: 170, y: 190 },
	applicationFolderPosition: { x: 490, y: 190 },
} as const

/** The bundler's fixed Finder view options (tauri-bundler `bundle_dmg`, ICON_SIZE=128, TEXT_SIZE=16).
 *  Mirrored, not chosen: the background is drawn against these so the arrow clears the icons. */
export const DMG_FINDER = { iconSize: 128, textSize: 16 } as const
