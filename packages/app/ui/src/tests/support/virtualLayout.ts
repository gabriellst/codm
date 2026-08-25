/**
 * A LAYOUT ENGINE, JUST BIG ENOUGH FOR A SCROLL CONTAINER.
 *
 * happy-dom runs no layout: `offsetHeight`, `clientHeight` and `scrollHeight` are all 0, and
 * assigning `scrollTop` fires no `scroll` event. Every one of those is load-bearing for a windowed
 * list, and every one of them fails OPEN — a zero silently turns an assertion into a tautology:
 *
 *   · `Virtualizer.getMaxScrollOffset()` is `scrollHeight - clientHeight`. At 0 − 0 it is 0, so
 *     `isAtEnd()` is ALWAYS true, and "does not follow the tail when the reader has scrolled up"
 *     would pass against a component containing no condition whatsoever.
 *   · `measureElement` reads `element.offsetHeight`. At 0 every row measures 0, the total size is 0,
 *     and "the scrollbar spans 1000 items" would pass against a list that renders nothing.
 *
 * So the emulation is explicit rather than implied, and it is deliberately NOT a mock of the code
 * under test's collaborators — it stands in for the browser, and it derives every number from what
 * the component actually wrote to the DOM: a scroller's `scrollHeight` IS the height its spacer
 * rendered, and a row's `offsetHeight` IS the height the caller declared for that row. Nothing a test
 * asserts is supplied by the emulation itself.
 *
 * Prototypes are patched and restored by the returned function; nothing here uses `mock.module`,
 * whose registry is per-process in bun and would leak into every other suite in the run.
 */

const isScroller = (el: Element) => el.getAttribute('data-slot') === 'virtual-list'
const isRow = (el: Element) => el.getAttribute('data-slot') === 'virtual-list-item'

export interface VirtualLayoutOptions {
	/** Height in px reported for every `VirtualList` scroll viewport. */
	viewport: number
	/** Height in px for the row at `index` — the caller's model of how tall its content renders. */
	rowHeight: (index: number) => number
}

/** The total size the component wrote onto its spacer: the emulation's source for `scrollHeight`. */
export function spacerHeight(scroller: Element): number {
	const spacer = scroller.querySelector('[data-slot="virtual-list-spacer"]')
	return spacer instanceof HTMLElement ? Number.parseFloat(spacer.style.height) || 0 : 0
}

/** Move a scroller the way a browser would: clamp to the scrollable range, then fire `scroll`. */
export function setScrollTop(element: HTMLElement, top: number): void {
	const max = Math.max(element.scrollHeight - element.clientHeight, 0)
	element.scrollTop = Math.min(Math.max(top, 0), max)
	element.dispatchEvent(new Event('scroll'))
}

/** Install the emulation. Returns the restore function — call it in `afterEach`. */
export function installVirtualLayout({ viewport, rowHeight }: VirtualLayoutOptions): () => void {
	const restores: (() => void)[] = []

	const patch = (target: object, prop: string, descriptor: PropertyDescriptor): void => {
		const original = Object.getOwnPropertyDescriptor(target, prop)
		Object.defineProperty(target, prop, { configurable: true, ...descriptor })
		restores.push(() => {
			if (original) Object.defineProperty(target, prop, original)
			else Reflect.deleteProperty(target, prop)
		})
	}

	const heightOf = (row: Element): number => rowHeight(Number(row.getAttribute('data-index')))

	patch(HTMLElement.prototype, 'offsetHeight', {
		get(this: HTMLElement) {
			if (isScroller(this)) return viewport
			if (isRow(this)) return heightOf(this)
			return 0
		},
	})
	patch(HTMLElement.prototype, 'clientHeight', {
		get(this: HTMLElement) {
			return isScroller(this) ? viewport : 0
		},
	})
	patch(Element.prototype, 'scrollHeight', {
		get(this: Element) {
			return isScroller(this) ? spacerHeight(this) : 0
		},
	})
	// happy-dom's own `scrollTo` assigns `scrollTop` but never clamps and never notifies. The
	// virtualizer learns its offset ONLY from the `scroll` event, so without this dispatch every
	// programmatic scroll would be invisible to it.
	patch(Element.prototype, 'scrollTo', {
		value(this: Element, options?: ScrollToOptions | number) {
			const top = typeof options === 'number' ? options : (options?.top ?? 0)
			setScrollTop(this as HTMLElement, top)
		},
		writable: true,
	})

	return () => {
		for (const restore of restores.reverse()) restore()
	}
}

/**
 * ONE third-party dev warning, filtered by exact text. Returns the restore function.
 *
 * `measureElement` is a callback ref, so it runs during commit; when an end-anchored list re-pins
 * itself there, virtual-core calls `notify(sync=true)` and react-virtual's `flushSync` lands inside
 * a lifecycle. React declines it and warns — a DEV-ONLY warning, from the library's own re-pin path,
 * about a flush React was going to batch anyway. The alternative is `useFlushSync: false`, which
 * would also disable the sync flush on the SCROLL path (virtual-core notifies sync while scrolling),
 * and that one is load-bearing for smooth scrolling — so the warning is accepted in production and
 * silenced here instead. The match is on the full sentence: any other console.error still surfaces.
 */
export function silenceLibraryFlushSyncWarning(): () => void {
	const original = console.error
	console.error = (...args: unknown[]) => {
		if (typeof args[0] === 'string' && args[0].includes('flushSync was called from inside a lifecycle method')) return
		original(...args)
	}
	return () => {
		console.error = original
	}
}
