import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { VirtualList } from './virtual-list'

/**
 * VIRTUAL LIST — THE FOUR BEHAVIOURS OF AN END-ANCHORED WINDOW.
 *
 * ── THE HONESTY PROBLEM, AND WHAT THIS FILE DOES ABOUT IT ────────────────────────────────────────
 *
 * happy-dom runs no layout engine: `offsetHeight`, `clientHeight` and `scrollHeight` are all 0, and
 * assigning `scrollTop` fires no `scroll` event. Every one of those is load-bearing for the code
 * under test, and each zero fails OPEN — silently turning a real assertion into a tautology:
 *
 *   · `getMaxScrollOffset()` is `scrollHeight - clientHeight`. At 0 − 0 it is 0, so
 *     `isAtEnd() === (0 - scrollOffset <= threshold)` is ALWAYS true — and "does not follow when the
 *     reader has scrolled up" would pass against a component with no condition in it at all.
 *   · `measureElement` reads `element.offsetHeight`. At 0, every row measures 0, the total size is
 *     0, and "the scrollbar spans 1000 items" would pass against a list that renders nothing.
 *
 * So this file installs an explicit, minimal LAYOUT EMULATION (`installLayout`) rather than letting
 * the zeros stand. It is deliberately not a mock of the component's collaborators — it is a stand-in
 * for the browser, and it derives its numbers from what the component actually wrote to the DOM:
 * the scroller's `scrollHeight` IS the spacer's rendered inline height, and a row's `offsetHeight`
 * IS the height the test declared for the item at that row's `data-index`. Nothing is asserted that
 * the emulation itself supplies. `describe('the harness')` pins that the emulation produces real,
 * non-zero geometry, so the suite fails loudly if the emulation ever stops working instead of
 * quietly going vacuous again.
 *
 * `mock.module` is avoided throughout (bun's module registry is per-process, so mocking a dependency
 * here would leak into every other suite in the run). The emulation patches prototypes and restores
 * them in `afterEach`.
 */

// ── the layout emulation ────────────────────────────────────────────────────────────────────────

/** Height in px of the scroll viewport the emulation reports for the list container. */
const VIEWPORT = 600

/** The items currently rendered, so a row's `data-index` can be resolved to its declared height. */
let mounted: readonly Item[] = []

interface Item {
	id: string
	height: number
	label: string
}

function item(id: string, height = 100): Item {
	return { id, height, label: `entry ${id}` }
}

type Restore = () => void
let restores: Restore[] = []

/**
 * ONE third-party dev warning, filtered by exact text.
 *
 * `measureElement` is a callback ref, so it runs during commit; when an end-anchored list re-pins
 * itself there, virtual-core calls `notify(sync=true)` and react-virtual's `flushSync` lands inside
 * a lifecycle. React declines it and warns — a DEV-ONLY warning, from the library's own re-pin path,
 * about a flush React was going to batch anyway. The alternative is `useFlushSync: false`, which
 * would also disable the sync flush on the SCROLL path (virtual-core notifies sync while scrolling),
 * and that one is load-bearing for smooth scrolling — so the warning is accepted in production and
 * silenced here instead. The match is on the full sentence: any other console.error still surfaces.
 */
const REACT_FLUSHSYNC_WARNING = 'flushSync was called from inside a lifecycle method'

function silenceLibraryFlushSyncWarning(): void {
	const original = console.error
	console.error = (...args: unknown[]) => {
		if (typeof args[0] === 'string' && args[0].includes(REACT_FLUSHSYNC_WARNING)) return
		original(...args)
	}
	restores.push(() => {
		console.error = original
	})
}

function patch(target: object, prop: string, descriptor: PropertyDescriptor): void {
	const original = Object.getOwnPropertyDescriptor(target, prop)
	Object.defineProperty(target, prop, { configurable: true, ...descriptor })
	restores.push(() => {
		if (original) Object.defineProperty(target, prop, original)
		else Reflect.deleteProperty(target, prop)
	})
}

const isScroller = (el: Element) => el.getAttribute('data-slot') === 'virtual-list'
const isRow = (el: Element) => el.getAttribute('data-slot') === 'virtual-list-item'

/** The total size the component wrote onto the spacer — the emulation's source for `scrollHeight`. */
function spacerHeight(scroller: Element): number {
	const spacer = scroller.querySelector('[data-slot="virtual-list-spacer"]')
	return spacer instanceof HTMLElement ? Number.parseFloat(spacer.style.height) || 0 : 0
}

function declaredRowHeight(row: Element): number {
	const index = Number(row.getAttribute('data-index'))
	return mounted[index]?.height ?? 0
}

/**
 * Give happy-dom just enough of a layout engine for a scroll container to be real: a viewport with a
 * height, a content box as tall as what was rendered into it, a `scrollTop` that clamps like a
 * browser's, and a `scroll` event when it moves.
 */
function installLayout(): void {
	patch(HTMLElement.prototype, 'offsetHeight', {
		get(this: HTMLElement) {
			if (isScroller(this)) return VIEWPORT
			if (isRow(this)) return declaredRowHeight(this)
			return 0
		},
	})
	patch(HTMLElement.prototype, 'clientHeight', {
		get(this: HTMLElement) {
			return isScroller(this) ? VIEWPORT : 0
		},
	})
	patch(Element.prototype, 'scrollHeight', {
		get(this: Element) {
			return isScroller(this) ? spacerHeight(this) : 0
		},
	})
	// happy-dom's own `scrollTo` assigns `scrollTop` but never clamps and never notifies. The
	// virtualizer learns its offset ONLY from the `scroll` event, so without the dispatch every
	// programmatic scroll would be invisible to it.
	patch(Element.prototype, 'scrollTo', {
		value(this: Element, options?: ScrollToOptions | number) {
			const top = typeof options === 'number' ? options : (options?.top ?? 0)
			setScrollTop(this as HTMLElement, top)
		},
		writable: true,
	})
}

/** Move a scroller the way a browser would: clamp to the scrollable range, then fire `scroll`. */
function setScrollTop(element: HTMLElement, top: number): void {
	const max = Math.max(element.scrollHeight - element.clientHeight, 0)
	element.scrollTop = Math.min(Math.max(top, 0), max)
	element.dispatchEvent(new Event('scroll'))
}

// ── rendering ───────────────────────────────────────────────────────────────────────────────────

let root: Root | null = null
let host: HTMLElement | null = null

/** Effects can schedule effects (a measurement re-render schedules another measurement pass). */
function settle(passes = 4): void {
	for (let i = 0; i < passes; i++) act(() => {})
}

function render(items: readonly Item[], estimatedItemHeight = 100): HTMLElement {
	mounted = items
	act(() => {
		root!.render(
			<VirtualList
				items={items}
				getItemKey={i => i.id}
				estimatedItemHeight={estimatedItemHeight}
				renderItem={i => <span>{i.label}</span>}
			/>,
		)
	})
	settle()
	return host!.querySelector('[data-slot="virtual-list"]') as HTMLElement
}

function rows(scroller: HTMLElement): HTMLElement[] {
	return [...scroller.querySelectorAll<HTMLElement>('[data-slot="virtual-list-item"]')]
}

function renderedIndices(scroller: HTMLElement): number[] {
	return rows(scroller).map(r => Number(r.getAttribute('data-index')))
}

/** Where a row's top edge sits relative to the top of the viewport — its VISUAL position. */
function viewportOffsetOf(scroller: HTMLElement, itemId: string): number {
	const row = rows(scroller).find(r => mounted[Number(r.getAttribute('data-index'))]?.id === itemId)
	if (!row) throw new Error(`row ${itemId} is not mounted`)
	const translate = /translateY\((-?[\d.]+)px\)/.exec(row.style.transform)
	return Number(translate?.[1] ?? 0) - scroller.scrollTop
}

function list(count: number, prefix = 'm', height = 100): Item[] {
	return Array.from({ length: count }, (_, i) => item(`${prefix}${i}`, height))
}

beforeEach(() => {
	installLayout()
	silenceLibraryFlushSyncWarning()
	host = document.createElement('div')
	document.body.appendChild(host)
	root = createRoot(host)
})

afterEach(() => {
	act(() => root?.unmount())
	root = null
	host?.remove()
	host = null
	mounted = []
	for (const restore of restores.reverse()) restore()
	restores = []
})

// ── the harness itself ──────────────────────────────────────────────────────────────────────────

describe('the harness — a test that passes on zero geometry proves nothing', () => {
	/**
	 * The guard for every assertion below. If happy-dom's zeros ever come back (a prototype patch
	 * stops applying, a `data-slot` is renamed), this is what goes red — instead of the behaviour
	 * tests silently going green for the wrong reason.
	 */
	it('reports a real viewport, a real content height and a clamping scrollTop', () => {
		const scroller = render(list(100))

		expect(scroller.clientHeight).toBe(VIEWPORT)
		expect(scroller.offsetHeight).toBe(VIEWPORT)
		// 100 items × 100px — the content box is far taller than the viewport, so there is something
		// to scroll and `isAtEnd` is a real question rather than `0 - 0 <= threshold`.
		expect(scroller.scrollHeight).toBe(10_000)
		expect(scroller.scrollHeight - scroller.clientHeight).toBe(9_400)

		act(() => setScrollTop(scroller, 5_000))
		expect(scroller.scrollTop).toBe(5_000)

		// Clamped at both ends, like a browser.
		act(() => setScrollTop(scroller, 999_999))
		expect(scroller.scrollTop).toBe(9_400)
		act(() => setScrollTop(scroller, -50))
		expect(scroller.scrollTop).toBe(0)
	})

	it('measures rows from their declared heights, not from zero', () => {
		const scroller = render([item('a', 40), item('b', 250), item('c', 40)])

		for (const row of rows(scroller)) expect(row.offsetHeight).toBeGreaterThan(0)
	})
})

// ── behaviour 1: variable heights ───────────────────────────────────────────────────────────────

describe('variable heights — the estimate is a seed, the measurement is the truth', () => {
	/**
	 * A chat message is as tall as its text. Seeded at 100px but actually 40/250/40, the total can
	 * only be 330 if every row was MEASURED; a component trusting `estimateSize` reports 300, and one
	 * with a broken `data-index` (every measurement landing on row 0) reports something else again.
	 */
	it('the total size is the sum of the real heights, not count × estimate', () => {
		const scroller = render([item('a', 40), item('b', 250), item('c', 40)], 100)

		expect(spacerHeight(scroller)).toBe(330)
	})

	/**
	 * The consequence of measurement for LAYOUT, not just for the total: each row is positioned at the
	 * running sum of the ones before it. With a fixed estimate the third row would sit at 200.
	 */
	it('rows are positioned by the measured heights of their predecessors', () => {
		const scroller = render([item('a', 40), item('b', 250), item('c', 40)], 100)
		const tops = rows(scroller).map(r => Number(/translateY\((-?[\d.]+)px\)/.exec(r.style.transform)?.[1]))

		expect(tops).toEqual([0, 40, 290])
	})
})

// ── behaviour 2: mounts at the end ──────────────────────────────────────────────────────────────

describe('end-anchored mount — a thread opens on its newest message', () => {
	/**
	 * 200 × 100px against a 600px viewport. Landing at the end means the LAST item is mounted and the
	 * FIRST is not — the inverse of what an unanchored virtual list does.
	 */
	it('mounts with the viewport at the last item, not the first', () => {
		const scroller = render(list(200))

		expect(scroller.scrollTop).toBe(200 * 100 - VIEWPORT)

		const indices = renderedIndices(scroller)
		expect(indices).toContain(199)
		expect(indices).not.toContain(0)
	})

	it('an empty list does not try to anchor', () => {
		const scroller = render([])

		expect(scroller.scrollTop).toBe(0)
		expect(rows(scroller)).toHaveLength(0)
	})
})

// ── behaviour 3: conditional stick-to-bottom ────────────────────────────────────────────────────

describe('stick-to-bottom — only for a reader who is already at the bottom', () => {
	it('a message arriving while the reader is at the end pulls the viewport with it', () => {
		const items = list(50)
		const scroller = render(items)
		expect(scroller.scrollTop).toBe(50 * 100 - VIEWPORT)

		const grown = [...items, item('new')]
		render(grown)

		// The viewport followed onto the new last row, and that row is mounted.
		expect(scroller.scrollTop).toBe(51 * 100 - VIEWPORT)
		expect(renderedIndices(scroller)).toContain(50)
	})

	/**
	 * THE CONDITION. A reader who has scrolled up into history is reading; an arriving message must
	 * not yank them to the bottom. This is the assertion that goes red when the condition is removed
	 * (see the falsifier note on `followOnAppend` in the primitive).
	 */
	it('a message arriving while the reader is scrolled up leaves the viewport alone', () => {
		const items = list(50)
		const scroller = render(items)

		// Scroll up into the middle of the history and confirm we are genuinely NOT at the end.
		act(() => setScrollTop(scroller, 1_000))
		settle()
		expect(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop).toBeGreaterThan(32)

		render([...items, item('new')])

		expect(scroller.scrollTop).toBe(1_000)
	})

	/**
	 * A re-render that does not append (same items, new array identity — what a refetch produces)
	 * must not be read as an append and must not move a scrolled-up reader either.
	 */
	it('a refetch that changes nothing does not move the viewport', () => {
		const items = list(50)
		const scroller = render(items)
		act(() => setScrollTop(scroller, 1_500))
		settle()

		render([...items])

		expect(scroller.scrollTop).toBe(1_500)
	})
})

// ── behaviour 4: prepend without a jump ─────────────────────────────────────────────────────────

describe('prepend — paginating backwards keeps the read item under the eye', () => {
	/**
	 * The defining test for backwards pagination. 50 rows are inserted ABOVE the viewport, which
	 * shifts every existing offset down by 5000px. What must NOT change is where the item the reader
	 * was looking at SITS ON SCREEN — measured as `row.translateY - scrollTop`, which is exactly its
	 * distance from the top of the viewport.
	 */
	it('the item being read stays at the same place on screen', () => {
		const original = list(60, 'm')
		const scroller = render(original)

		act(() => setScrollTop(scroller, 2_000))
		settle()

		// The topmost mounted row that is actually inside the viewport — what the reader's eye is on.
		const anchorId = original[20]!.id
		const before = viewportOffsetOf(scroller, anchorId)
		const scrollTopBefore = scroller.scrollTop

		render([...list(50, 'older'), ...original])

		// The offset moved (5000px of new content above it) — but the VISUAL position did not.
		expect(scroller.scrollTop).toBe(scrollTopBefore + 5_000)
		expect(viewportOffsetOf(scroller, anchorId)).toBe(before)
	})

	/** Prepending must not be mistaken for an append: the viewport does not jump to the bottom. */
	it('a prepend does not trigger stick-to-bottom', () => {
		const original = list(60, 'm')
		const scroller = render(original)
		act(() => setScrollTop(scroller, 2_000))
		settle()

		render([...list(50, 'older'), ...original])

		expect(scroller.scrollTop).not.toBe(scroller.scrollHeight - scroller.clientHeight)
	})
})

// ── the point of the exercise: 1000 items ───────────────────────────────────────────────────────

describe('1000 items — the DOM stays small and the scrollbar stays honest', () => {
	/**
	 * THE CEILING: 40 rows.
	 *
	 * Derived, not picked. The window is `ceil(viewport / itemHeight)` rows plus `overscan` on each
	 * side: 600/100 = 6 visible, +8 above +8 below = 22, and `rangeExtractor` cannot return more than
	 * that. 40 leaves headroom for a measurement pass that momentarily widens the range without
	 * leaving room for the regression this guards: a non-windowed render is 1000 rows, 25× the
	 * ceiling, so no plausible drift in overscan or viewport can sneak past it. The lower bound is
	 * asserted too — 0 rows would satisfy "fewer than 40" while rendering nothing at all.
	 */
	const CEILING = 40

	it('renders far fewer than 1000 rows', () => {
		const scroller = render(list(1_000))
		const count = rows(scroller).length

		expect(count).toBeLessThanOrEqual(CEILING)
		expect(count).toBeGreaterThanOrEqual(6)
	})

	/**
	 * A window whose spacer is only as tall as the window has a scrollbar that lies: the thumb says
	 * "you are seeing all of it" over 1000 items. The estimate is uniform and correct here on
	 * purpose, so this isolates "the scroll height spans ALL 1000" from measurement accuracy, which
	 * the variable-height tests above own.
	 */
	it('the scrollable height corresponds to all 1000 items, not to the mounted window', () => {
		const scroller = render(list(1_000))

		expect(scroller.scrollHeight).toBe(100_000)
		expect(scroller.scrollHeight - scroller.clientHeight).toBe(99_400)
	})

	/** And it is still end-anchored at that size: item 999 is on screen, item 0 is not in the DOM. */
	it('opens at the newest of the 1000', () => {
		const scroller = render(list(1_000))
		const indices = renderedIndices(scroller)

		expect(indices).toContain(999)
		expect(indices).not.toContain(0)
	})
})
