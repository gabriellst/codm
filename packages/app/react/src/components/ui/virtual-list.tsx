import { useCallback, useEffect, useLayoutEffect, useRef, type ComponentProps, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '@/lib/utils'

/**
 * A windowed list that keeps only the visible rows in the DOM, anchored at its END.
 *
 * WHY THIS EXISTS. The console renders conversation-shaped lists — a thread transcript, a terminal
 * log — straight out of a `.map()`, one DOM subtree per entry, for every entry the thread has ever
 * produced. `GetSessionChat` puts no LIMIT on `transcriptEntries`, so the row count is the age of
 * the conversation. The cost of that is not the data (a transcript entry is a few hundred bytes) but
 * the object graph: a heap sample of the webview showed 1.08M live allocations totalling 298MB, all
 * of it tiny objects (280k × 32B, 170k × 48B) and not one large buffer — the shape of a DOM and its
 * React fibers, not of payload. Windowing is the fix that addresses the actual cost.
 *
 * END-ANCHORED, NOT JUST VIRTUAL. A chat list read from the top is a different component from one
 * read from the bottom, and the difference is four behaviours that all have to hold at once:
 *
 *   1. VARIABLE HEIGHTS. A message is as tall as its text. `estimatedItemHeight` seeds the very
 *      first paint and nothing else — every mounted row is handed to `measureElement`, and the
 *      virtualizer caches the measured size BY ITEM KEY (`itemSizeCache`), not by index. That keying
 *      is what makes (4) possible: an item that shifts index keeps its measurement.
 *   2. MOUNTS AT THE END. Opening a thread must land on the newest message. The pin is written in a
 *      LAYOUT effect (pre-paint), so the first frame the user sees is already at the bottom rather
 *      than at the top followed by a jump — and it is HELD across the measurement passes that
 *      follow, because a first frame can only be pinned to the estimate. It retires the moment the
 *      reader scrolls up, and never engages again for that list.
 *   3. STICK-TO-BOTTOM, CONDITIONALLY. A new message follows the viewport only if the reader was
 *      already at the bottom. A reader scrolled up into history is left exactly where they are —
 *      that is `followOnAppend`, which the virtualizer gates on its own `isAtEnd(scrollEndThreshold)`
 *      and on the LAST key actually changing (a re-render with the same tail must not scroll).
 *   4. PREPEND WITHOUT A JUMP. Paginating backwards inserts rows ABOVE the viewport, which shifts
 *      every existing offset down. `anchorTo: 'end'` makes the virtualizer capture the topmost
 *      visible item as `[key, scrollOffset - item.start]` before the count changes and restore that
 *      exact relationship after — so the item being read stays put, whatever the prepended block
 *      measures.
 *
 * (2) is ours; (1), (3) and (4) are configured, not reimplemented — but they are configured together
 * with the DOM contract they depend on (`data-index` on every row, a stable `getItemKey`, the
 * measured ref), and getting any one of those wrong degrades silently into a list that merely looks
 * right. That coupling is the reason this is a primitive rather than four options at each call site,
 * and it is what `virtual-list.test.tsx` pins.
 *
 * WHEN NOT TO USE IT. Windowing trades DOM nodes for scroll bookkeeping and a scroll container of
 * its own. On a list whose length is bounded by the backend (the dashboard's `latestActivity` is
 * `.limit(8)`) it is pure cost. Reach for it when the row count grows with usage.
 */
export type VirtualListProps<TItem> = Omit<ComponentProps<'div'>, 'children'> & {
	/** The full list. Only the visible window of it reaches the DOM. */
	items: readonly TItem[]
	/**
	 * Stable identity per item. Measurements are cached under this key, so it must survive an index
	 * shift — returning the index would silently break prepend-without-jump.
	 */
	getItemKey: (item: TItem, index: number) => string | number
	renderItem: (item: TItem, index: number) => ReactNode
	/**
	 * First-paint seed ONLY, in px — never the height a row is rendered at. Real heights come from
	 * `measureElement`. A closer seed just means a shorter scrollbar settle on mount.
	 */
	estimatedItemHeight?: number
	/** Rows kept mounted beyond each edge of the viewport, to cover fast scrolls. */
	overscan?: number
	/**
	 * How near the bottom (px) still counts as "at the bottom" for stick-to-bottom. The virtualizer's
	 * own default is 1px, which loses the pin to sub-pixel scroll positions.
	 */
	stickToBottomThreshold?: number
	/** Class for the sized spacer inside the scroller (the element that owns the total scroll height). */
	listClassName?: string
	/** Class for each positioned row wrapper. */
	itemClassName?: string
}

export function VirtualList<TItem>({
	items,
	getItemKey,
	renderItem,
	estimatedItemHeight = 96,
	overscan = 8,
	stickToBottomThreshold = 32,
	className,
	listClassName,
	itemClassName,
	...props
}: VirtualListProps<TItem>) {
	const scrollRef = useRef<HTMLDivElement>(null)
	const count = items.length

	// Read through a ref so identity changes in the caller's `getItemKey` never re-seat the
	// virtualizer: re-creating it would drop `itemSizeCache` and with it every measured height.
	const getItemKeyRef = useRef(getItemKey)
	getItemKeyRef.current = getItemKey

	const keyForIndex = useCallback(
		(index: number) => {
			const item = items[index]
			return item === undefined ? index : getItemKeyRef.current(item, index)
			// `items` is intentionally the only dependency — see the ref above.
		},
		[items],
	)

	const virtualizer = useVirtualizer({
		count,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => estimatedItemHeight,
		getItemKey: keyForIndex,
		overscan,
		// (3) and (4). Both hang off `anchorTo: 'end'`: it is what makes the virtualizer capture a
		// key-anchored scroll position across a count change instead of trusting raw offsets.
		anchorTo: 'end',
		followOnAppend: true,
		scrollEndThreshold: stickToBottomThreshold,
	})

	const virtualItems = virtualizer.getVirtualItems()
	const totalSize = virtualizer.getTotalSize()

	// (2) MOUNT AT THE END — and STAY there until the reader takes over, which is one behaviour and
	// not two. A single write on mount cannot land at the end, because on the first commit the only
	// content height that exists is `count × estimatedItemHeight`: measurement runs off the row refs
	// and reaches the virtualizer AFTER this effect, so the write is clamped against a box that is
	// merely the GUESS of the list, and it lands the same FRACTION of the way down that the guess is
	// wrong by. Seeded at 88px against bubbles that wrap to 200, a thread opens a third of the way
	// in — at the top, to the operator reading it — and no test whose estimate happens to be exact
	// can see it.
	//
	// So the pin is held across the settling instead of fired once. Each commit re-pins to the end of
	// whatever the content measures NOW; every pass mounts the window one step nearer the end,
	// measuring it grows the box, and the next commit follows it down until the box stops moving —
	// at which point it is writing the offset already held and the browser does nothing with it. Note
	// that the box it converges on is NOT the true height of the list: rows that were never mounted
	// keep their estimate, so the scrollbar stays a guess until they are scrolled through. What
	// converges is the only thing that was asked for — the LAST row, on screen, at the bottom.
	//
	// IT IS RELEASED BY THE READER, NOT BY A HEURISTIC. Nothing here can tell "the box is still
	// settling" from "the box is done" at the moment it has to decide — the whole bug above is what
	// guessing that costs. What IS unambiguous is direction: every write in this file, and every
	// adjustment the virtualizer makes while anchored to the end, moves the offset DOWN or leaves it.
	// Only the reader moves it UP. So an offset found above where the pin last left it means the
	// reader is reading, and the pin retires for the lifetime of the list — from there on
	// `followOnAppend` alone decides whether an arriving message follows, exactly as (3) says.
	const isPinnedRef = useRef(true)
	const pinnedOffsetRef = useRef(0)
	useIsomorphicLayoutEffect(() => {
		if (!isPinnedRef.current || count === 0) return
		const element = scrollRef.current
		if (!element) return

		const maxOffset = Math.max(element.scrollHeight - element.clientHeight, 0)
		// Against `min(…)`, not against the last pin alone: an estimate that was too GENEROUS shrinks
		// the box as the real heights come in, and the browser clamps the offset down with it. That is
		// the content moving, not the reader, and reading it as a scroll-up would strand the list short
		// of the end in precisely the case this exists to fix.
		if (element.scrollTop < Math.min(pinnedOffsetRef.current, maxOffset)) {
			isPinnedRef.current = false
			return
		}

		pinnedOffsetRef.current = maxOffset
		// Written every commit rather than only when it would move, and both halves are load-bearing.
		// The raw assignment lands pre-paint against the box as it stands right now; `scrollToEnd()`
		// then puts the virtualizer's own offset in step with it, which is what `isAtEnd` reads to
		// decide whether the next arriving message follows. Skipping the pair once the offset already
		// matches looks free and is not: it also skips the notification that flushes the pending
		// measurements into a render, and the list settles one pass early on the estimate.
		element.scrollTop = maxOffset
		virtualizer.scrollToEnd()
	})

	return (
		<div ref={scrollRef} data-slot="virtual-list" className={cn('relative min-h-0 overflow-y-auto', className)} {...props}>
			{/* The scroller's full height lives here, so the scrollbar reflects ALL items and not just
			    the mounted window — a windowed list whose spacer lies is a list with a lying scrollbar. */}
			<div data-slot="virtual-list-spacer" className={cn('relative w-full', listClassName)} style={{ height: `${totalSize}px` }}>
				{virtualItems.map(virtualItem => {
					const item = items[virtualItem.index]
					if (item === undefined) return null
					return (
						<div
							key={virtualItem.key}
							// `data-index` is the virtualizer's own `indexAttribute`: it is how a measured
							// element reports WHICH row it is. Without it every measurement lands on row 0.
							data-index={virtualItem.index}
							data-slot="virtual-list-item"
							ref={virtualizer.measureElement}
							className={cn('absolute left-0 top-0 w-full', itemClassName)}
							style={{ transform: `translateY(${virtualItem.start}px)` }}
						>
							{renderItem(item, virtualItem.index)}
						</div>
					)
				})}
			</div>
		</div>
	)
}

/**
 * `useLayoutEffect` that degrades to `useEffect` where there is no DOM. The console is served by
 * TanStack Start, so a route module can be evaluated on the server, where React warns about layout
 * effects; the end-anchor has nothing to do there anyway.
 */
const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect
