import { IconBell, IconChevronLeft, IconChevronRight, IconLayoutSidebar, IconPlus } from '@tabler/icons-react'
import { useRouter } from '@tanstack/react-router'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import { isTauri } from '@/services/utils/tauri/isTauri'

/**
 * AppChrome — the integrated window title bar (VS Code style). The tauri Overlay titleBarStyle
 * (see @codedm/app-tauri/window) makes the webview own the full window height with the native
 * macOS traffic lights overlaid top-left; this bar draws the app's own header in that band —
 * three zones (nav · command center · actions) woven with `data-tauri-drag-region` so the empty
 * space drags the window while the controls stay clickable.
 *
 * Scaffold: the command center + toggles are placeholders to fill in. Window min/max/close are
 * macOS-native (traffic lights); the Win/Linux custom controls are a TODO — they need a
 * WindowService in the services DI so getCurrentWindow() stays inside the code-split tauri layer.
 */
export function AppChrome() {
	const router = useRouter()
	// In Overlay mode the traffic lights sit top-left — reserve room for them (only inside the shell).
	const trafficLightPad = isTauri() ? 'pl-[78px]' : 'pl-3'
	return (
		<header
			data-tauri-drag-region
			className="grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-border/60 bg-route-background/70 backdrop-blur"
		>
			{/* LEFT — nav. Padding clears the overlaid traffic lights. */}
			<div data-tauri-drag-region className={cn('flex items-center gap-1', trafficLightPad)}>
				<ChromeButton aria-label="Back" onClick={() => router.history.back()}>
					<IconChevronLeft className="size-4" />
				</ChromeButton>
				<ChromeButton aria-label="Forward" onClick={() => router.history.forward()}>
					<IconChevronRight className="size-4" />
				</ChromeButton>
			</div>

			{/* CENTER — command center (the "codedm" bar). Placeholder to fill in. */}
			<div className="flex justify-center">
				<CommandCenter />
			</div>

			{/* RIGHT — actions + (Win/Linux) window controls. */}
			<div data-tauri-drag-region className="flex items-center justify-end gap-1 pr-3">
				<ChromeButton aria-label="Notifications">
					<IconBell className="size-4" />
				</ChromeButton>
				<ChromeButton aria-label="New">
					<IconPlus className="size-4" />
				</ChromeButton>
				<ChromeButton aria-label="Toggle sidebar">
					<IconLayoutSidebar className="size-4" />
				</ChromeButton>
				{/* TODO(win/linux): <WindowControls /> (min/max/close) via a WindowService. */}
			</div>
		</header>
	)
}

function ChromeButton({ className, ...props }: ComponentProps<'button'>) {
	return (
		<button
			type="button"
			className={cn(
				'grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground',
				className,
			)}
			{...props}
		/>
	)
}

/** Placeholder for the centered command bar (the "codedm" pill in the VS Code title bar). */
function CommandCenter() {
	return (
		<button
			type="button"
			className="flex h-7 w-[420px] max-w-[40vw] items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/60"
		>
			<span className="truncate">codedm</span>
		</button>
	)
}
