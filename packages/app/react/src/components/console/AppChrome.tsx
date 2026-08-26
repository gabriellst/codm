import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import { type TitleBar, useWindowChrome } from '@/services'

/**
 * AppChrome — the integrated window title bar (VS Code style). On macOS the tauri Overlay
 * titleBarStyle (see packages/app/tauri/config/window.ts) makes the webview own the full window
 * height with the native traffic lights overlaid top-left; this bar draws the app's own header in
 * that band. On Windows/Linux the same config yields a NATIVE decorated title bar above the webview
 * (min/max/close come from the OS), and in a browser tab the browser's own bar sits above the page.
 *
 * WHICH band to reserve is the HOST's fact, not the platform's name: `useWindowChrome()` asks the
 * WindowService port (`window_chrome` in the shell), and the bar branches on what it REPORTS —
 * never a platform-detection util here (desktop-shell bp-02). Dispatch by map, not by `if` chain
 * (CMP-P18).
 *
 * NO FLASH while the port answers: the band is mirrored left and right in a
 * `grid-cols-[auto_1fr_auto]`, so the wordmark is a true centre at EVERY band width. Before the
 * answer (`null`) the bar renders the gutter; the answer only widens both sides symmetrically, and
 * nothing the eye tracks moves. `data-title-bar` publishes the resolved answer (absent until then).
 *
 * Deliberately minimal: the reserved band and the wordmark, nothing else. `data-tauri-drag-region`
 * is on the header AND on both spacers so the whole bar drags the window — the attribute is not
 * inherited, so any element added here needs it too, or that patch of the bar stops dragging. On a
 * native title bar the attribute is harmless (the OS bar drags too; this one just adds surface).
 *
 * Custom window controls for the native hosts are OUT on purpose: native decorations already
 * provide them.
 */
const BAND: Record<TitleBar, string> = {
	// Traffic lights overlaid top-left — reserve the band so the wordmark clears them.
	overlay: 'w-[78px]',
	// Nothing overlaps the webview — just the gutter.
	native: 'w-3',
}

export function AppChrome({ className, ...props }: ComponentProps<'header'>) {
	const chrome = useWindowChrome()
	const trafficLightBand = BAND[chrome?.titleBar ?? 'native']
	return (
		<header
			data-tauri-drag-region
			data-title-bar={chrome?.titleBar}
			className={cn(
				'grid h-8 shrink-0 grid-cols-[auto_1fr_auto] items-center border-b border-border/60 bg-route-background/70 backdrop-blur',
				className,
			)}
			{...props}
		>
			<div data-tauri-drag-region className={trafficLightBand} />
			<div data-tauri-drag-region className="flex justify-center">
				{/* eslint-disable-next-line local/no-hardcoded-jsx-text -- brand wordmark, never localized (see Logo.tsx) */}
				<span className="select-none text-sm text-muted-foreground">codm</span>
			</div>
			<div data-tauri-drag-region className={trafficLightBand} />
		</header>
	)
}
