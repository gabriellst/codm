import { BaseError, type BaseDomainErrors } from '@template/core-typescript'

/** Anything carrying a half-open `[startDate, endDate)` window. `endDate` null = +∞. */
export interface TimeWindowed {
	startDate: Date
	endDate: Date | null
}

/**
 * Immutable last-write-wins interval series. `place(entry)` overwrites exactly
 * `[entry.startDate, entry.endDate)` and trims/splits/removes overlapping
 * entries so the series stays sorted and non-overlapping. Entries are plain
 * windowed objects (the `z.historical`-inferred shapes), cloned via spread on
 * trim/split. Scope a Timeline per logical key (e.g. one per gateway
 * platform×method) — placing into one Timeline never affects another.
 */
export class Timeline<T extends TimeWindowed> {
	constructor(public readonly entries: readonly T[]) {
		const sorted = [...entries].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
		for (let i = 1; i < sorted.length; i++) {
			const prev = sorted[i - 1]!
			const cur = sorted[i]!
			if (prev.endDate === null || prev.endDate > cur.startDate) {
				throw new BaseError<BaseDomainErrors>('INVALID_DATE_RANGE' as BaseDomainErrors)
			}
		}
		this.entries = sorted
	}

	static empty<T extends TimeWindowed>(): Timeline<T> {
		return new Timeline<T>([])
	}

	place(entry: T): Timeline<T> {
		const s = entry.startDate
		const e = entry.endDate
		const next: T[] = []
		for (const ex of this.entries) {
			const a = ex.startDate
			const b = ex.endDate
			const noOverlap = (b !== null && b <= s) || (e !== null && a >= e)
			if (noOverlap) {
				next.push(ex)
				continue
			}
			if (a < s) next.push({ ...ex, startDate: a, endDate: s })
			if (e !== null && (b === null || e < b)) next.push({ ...ex, startDate: e, endDate: b })
		}
		next.push(entry)
		return new Timeline<T>(next)
	}

	activeAt(date: Date): T | undefined {
		return this.entries.find(en => en.startDate <= date && (en.endDate === null || date < en.endDate))
	}

	current(): T | undefined {
		return this.entries.find(en => en.endDate === null)
	}
}
