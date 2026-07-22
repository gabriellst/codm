import { customType } from 'drizzle-orm/pg-core'

/**
 * `jsonb` column type for `drizzle-orm/node-postgres`.
 *
 * node-postgres parses jsonb on read (returns objects) and binds objects as
 * text on write — drizzle's stock `jsonb` does the right thing. We keep this
 * wrapper to preserve the `jsonb<TData>(name)` call shape used across schemas.
 */
export const jsonb = <TData>(name: string) =>
	customType<{ data: TData; driverData: string }>({
		dataType() {
			return 'jsonb'
		},
		toDriver(value) {
			return JSON.stringify(value)
		},
		fromDriver(value) {
			if (typeof value === 'string') {
				return JSON.parse(value) as TData
			}
			return value as TData
		},
	})(name)
