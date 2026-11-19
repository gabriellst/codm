import { BATCH_EXCERPT_MAX, BATCH_ITEMS_MAX } from '@shared/objects'

/** The fewest listed items that make a message a BATCH (fase 4, item 5 — spec: "≥ 3 itens"). */
export const BATCH_MIN_ITEMS = 3

/**
 * The line shapes that open a list item — numbered (`1.`, `2)`, `3 -`) or bulleted (`-`, `*`, `•`). A line
 * counts only when the marker STARTS it (after indentation): a number in the middle of a sentence ("as 3
 * telas e os 2 botões") is prose, never a list.
 */
const ITEM_MARKERS: readonly RegExp[] = [/^\s*\d{1,3}\s*[.)\-–:]\s+(\S.*)$/, /^\s*[-*•]\s+(\S.*)$/]

/** One listed item as the detector read it — its number by position (1-based) and its text. */
export interface DetectedBatchItem {
	n: number
	excerpt: string
}

/**
 * THE BATCH, BY RULE (fase 4, item 5) — no model: a message whose lines open with a list marker, at least
 * `BATCH_MIN_ITEMS` of them, is a batch of that many items. A line that does not open with a marker continues
 * the item above it (a wrapped request) until a blank line; text before the first marker, or after a blank
 * line, is the message's own prose, not an item.
 *
 * Items are numbered BY POSITION, whatever the person typed ("1, 2, 4" is three items, 1..3) — the batch's
 * invariant is "every item 1..N has a destination", so N must be what the orchestrator can count.
 *
 * Returns `undefined` for anything else — fewer items, or more than `BATCH_ITEMS_MAX` (the wire's ceiling: such a
 * message goes the ordinary way rather than as a batch whose tail would be cut).
 */
export function detectBatch(text: string): DetectedBatchItem[] | undefined {
	const items: string[] = []
	// A blank line closes the item above: what follows it without a marker is the message's closing prose.
	let open = false
	for (const line of text.split(/\r?\n/)) {
		const opened = ITEM_MARKERS.map(marker => marker.exec(line)?.[1]).find(match => match !== undefined)
		if (opened !== undefined) {
			items.push(opened.trim())
			open = true
			continue
		}
		const continued = line.trim()
		if (continued.length === 0) open = false
		else if (open) items[items.length - 1] = `${items[items.length - 1]} ${continued}`
	}
	if (items.length < BATCH_MIN_ITEMS || items.length > BATCH_ITEMS_MAX) return undefined
	return items.map((excerpt, index) => ({ n: index + 1, excerpt: excerpt.slice(0, BATCH_EXCERPT_MAX) }))
}
