/**
 * Window PRESENTATION — owned by the desktop shell package, NOT the abstract contract.
 *
 * The integrated title bar (native macOS traffic lights overlaying the app's own header instead
 * of a separate OS title bar) is a house STANDARD for every stamped desktop app — so it lives
 * HERE in @codedm/app-tauri, not in REPO.desktop.window (which stays product-specific: size +
 * label). To change it for a specific app, edit THIS file in that app's tauri package; the
 * template's copy is the default new apps inherit — no touch to template.config.
 *
 * scripts/desktop/generate.ts spreads WINDOW into the generated tauri.conf.json window. It is
 * NOT hand-editable in tauri.conf.json (that file is generated + drift-checked) — change it here.
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
