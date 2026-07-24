/**
 * Window config — owned by the desktop shell package, colocated with the rest of the config
 * surface (this folder). Split into two consts by provenance:
 *
 *  - WINDOW (presentation) is a house STANDARD for every stamped desktop app — the integrated
 *    title bar (native macOS traffic lights overlaying the app's own header instead of a separate
 *    OS title bar). To change it for a specific app, edit THIS file in that app's tauri package.
 *  - WINDOW_FRAME (size + label) are genuine per-product shell decisions — parameters with
 *    defaults, no repo-fact source (was `REPO.desktop.window`).
 *
 * `./generate.ts` spreads WINDOW over WINDOW_FRAME into the generated tauri.conf.json window
 * (presentation wins). Neither is hand-editable in tauri.conf.json (that file is generated +
 * drift-checked) — change it here.
 */
export const WINDOW = {
	// macOS: keep the native traffic lights, make the title bar transparent, and let the webview
	// draw the full window height. The app renders its own header (react AppChrome, with
	// `data-tauri-drag-region`) and the traffic lights overlay its left edge.
	titleBarStyle: 'Overlay',
	// Hide the OS title text — the app owns the top band.
	hiddenTitle: true,
	// Nudge the traffic lights in/down so they vertically center in the taller custom header.
	trafficLightPosition: { x: 19, y: 18 },
} as const

/** Window FRAME — size + label. Genuine shell decisions (defaults, no repo-fact source);
 *  was `REPO.desktop.window`. The generated window `title` comes from `./app` DISPLAY_NAME. */
export const WINDOW_FRAME = { label: 'main', width: 1280, height: 800, minWidth: 980, minHeight: 640 } as const
