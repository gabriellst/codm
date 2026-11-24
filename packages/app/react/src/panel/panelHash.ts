import { useSyncExternalStore } from 'react'
import type { Batch, GetPanelBoardQueryResponse } from '@codm/client-typescript/typescript-cloud'

/**
 * THE ADDRESS IS THE SOURCE OF TRUTH for what is open on the panel (spec review M10): `#APP-12` is a task,
 * `#L-31` a batch — the exact links the group already receives from the daemon (`PanelPublisher`, the batch
 * receipt). Opening and closing REPLACE the entry (no history pile-up, as the old page did); closing drops the
 * hash so a reload shows the board. `replaceState` fires no event, so this module notifies its own subscribers.
 */

type Board = GetPanelBoardQueryResponse
type BoardIssue = Board['issues'][number]

const listeners = new Set<() => void>()

function notify() {
	for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener)
	window.addEventListener('hashchange', listener)
	return () => {
		listeners.delete(listener)
		window.removeEventListener('hashchange', listener)
	}
}

/** The hash without `#`, decoded; a malformed escape reads as nothing open. */
function readHash(): string {
	try {
		return decodeURIComponent(window.location.hash.slice(1))
	} catch {
		return ''
	}
}

/** The open key (`APP-12`, `L-31`) — empty when the board is showing. */
export function usePanelHash(): string {
	return useSyncExternalStore(subscribe, readHash, () => '')
}

function replaceHash(hash: string) {
	const { pathname, search } = window.location
	window.history.replaceState(window.history.state, '', `${pathname}${search}${hash}`)
	notify()
}

/** Opens a task (by key) or a batch (by code). */
export function openHash(key: string) {
	replaceHash(`#${encodeURIComponent(key)}`)
}

/** Back to the board. */
export function clearHash() {
	replaceHash('')
}

export type HashTarget = { kind: 'board' } | { kind: 'task'; issue: BoardIssue } | { kind: 'batch'; batch: Batch }

/**
 * What the hash names on THIS board: a code the board lists as a batch opens that batch (batches first, as the
 * old page did); otherwise a task key the board has opens the task. An unknown key — or a board not loaded yet
 * — shows the board.
 */
export function hashTarget(hash: string, board: Board | undefined): HashTarget {
	if (!hash || !board) return { kind: 'board' }
	const batch = board.batches.find(candidate => candidate.code === hash)
	if (batch) return { kind: 'batch', batch }
	const issue = board.issues.find(candidate => candidate.key === hash)
	return issue ? { kind: 'task', issue } : { kind: 'board' }
}
