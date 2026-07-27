import { isTauri } from '@/services/utils/tauri/isTauri'

/**
 * AppChrome — the integrated window title bar (VS Code style). The tauri Overlay titleBarStyle
 * (see packages/app/tauri/config/window.ts) makes the webview own the full window height with the
 * native macOS traffic lights overlaid top-left; this bar draws the app's own header in that band.
 *
 * Deliberately minimal: traffic lights and the wordmark, nothing else. `data-tauri-drag-region` is
 * on the header AND on both spacers so the whole bar drags the window — the attribute is not
 * inherited, so any element added here needs it too, or that patch of the bar stops dragging.
 *
 * Window min/max/close are macOS-native (the traffic lights). The Win/Linux custom controls remain a
 * TODO: they need a WindowService in the services DI so getCurrentWindow() stays inside the
 * code-split tauri layer.
 */
export function AppChrome() {
	// In Overlay mode the traffic lights sit top-left, overlaid on the webview — reserve the band so
	// the wordmark clears them, and mirror it on the right so the centre stays a true centre.
	const trafficLightBand = isTauri() ? 'w-[78px]' : 'w-3'
	return (
		<header
			data-tauri-drag-region
			className="grid h-11 shrink-0 grid-cols-[auto_1fr_auto] items-center border-b border-border/60 bg-route-background/70 backdrop-blur"
		>
			<div data-tauri-drag-region className={trafficLightBand} />
			<div data-tauri-drag-region className="flex justify-center">
				{/* eslint-disable-next-line local/no-hardcoded-jsx-text -- brand wordmark, never localized (see Logo.tsx) */}
				<span className="select-none text-sm text-muted-foreground">codedm</span>
			</div>
			<div data-tauri-drag-region className={trafficLightBand} />
		</header>
	)
}
