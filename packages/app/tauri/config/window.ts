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
import { DISPLAY_NAME } from './app'

export const WINDOW = {
	// macOS: keep the native traffic lights, make the title bar transparent, and let the webview
	// draw the full window height. The app renders its own header (react AppChrome, with
	// `data-tauri-drag-region`) and the traffic lights overlay its left edge.
	titleBarStyle: 'Overlay',
	// Hide the OS title text — the app owns the top band.
	hiddenTitle: true,
	// Nudge the traffic lights in/down so they vertically center in the taller custom header.
	trafficLightPosition: { x: 19, y: 18 },
	// BORN HIDDEN. The shell reveals this window only when EVERY sidecar has answered its health
	// probe (`src-tauri/src/sidecars/gate.rs` — `ReadinessGate` → `Reveal::Main`). Without this the
	// console painted the instant the webview existed, while the daemon was still applying
	// migrations, so the first thing an operator saw was a UI querying a port nobody was listening
	// on yet: failed reads, a dead SSE stream, and a dashboard that filled in seconds later if at all.
	//
	// A house standard rather than a per-product knob — every stamped app boots sidecars this way —
	// and the reveal is now FAIL-CLOSED: a sidecar that never becomes healthy sends the boot to
	// BOOT_ERROR_FRAME below and leaves THIS window hidden. Opening a console whose backends are
	// dead was the older, worse failure — the operator got a silently broken dashboard.
	visible: false,
} as const

/** Window FRAME — size + label. Genuine shell decisions (defaults, no repo-fact source);
 *  was `REPO.desktop.window`. The generated window `title` comes from `./app` DISPLAY_NAME. */
export const WINDOW_FRAME = { label: 'main', width: 1280, height: 800, minWidth: 980, minHeight: 640 } as const

/**
 * The BOOT-ERROR splash — the window the readiness gate opens instead of the console when any
 * sidecar fails to come up (`Reveal::BootError`). Born hidden exactly like the main window; only
 * one of the two is ever revealed.
 *
 * `url` is a plain HTML file served from the console's `public/` (copied verbatim into
 * `dist/client` by vite, served at the root in dev) — deliberately NOT a React route, because the
 * console fires SDK queries on boot against precisely the backends that just failed. Its label must
 * also appear in the generated capabilities: `core:default` (which covers `invoke`) is granted PER
 * WINDOW, and without it the splash could not call `boot_failures` / `retry_boot`.
 */
export const BOOT_ERROR_FRAME = {
	label: 'boot-error',
	width: 720,
	height: 520,
	url: 'boot-error.html',
	visible: false,
	// `DISPLAY_NAME`, não o literal: esta linha dizia `'CODM — boot failed'` enquanto o `app.ts` dizia
	// `CoDM` — grafias diferentes da mesma marca, na mesma pasta, divergidas desde o redesign de agosto
	// que corrigiu uma e não a outra. É a prova de que espelho sem fonte única não se mantém, e por
	// isso a grafia virou `REPO.brandDisplay` (T8/C).
	title: `${DISPLAY_NAME} — boot failed`,
} as const
