import { PanelOpenStopSchema, type PanelOpenStop } from '@shared/schemas'

/**
 * A group's open stops, read from the jsonb column the roster push wrote. The column carries JSON whose
 * shape the TS core owns (`PanelOpenStopSchema`, including the fase-3 `ask`); a stop that no longer parses
 * (a shape from another version) is dropped — it offers no button — rather than failing the whole page.
 */
export function parseOpenStops(rows: readonly unknown[]): PanelOpenStop[] {
	return rows.flatMap(row => {
		const parsed = PanelOpenStopSchema.safeParse(row)
		return parsed.success ? [parsed.data] : []
	})
}
