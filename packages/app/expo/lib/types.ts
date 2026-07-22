export type FieldPaths<T, Prefix extends string = ''> = T extends object
	? {
			[K in keyof T & string]: T[K] extends object
				? T[K] extends unknown[]
					? `${Prefix}${K}`
					: `${Prefix}${K}` | FieldPaths<T[K], `${Prefix}${K}.`>
				: `${Prefix}${K}`
		}[keyof T & string]
	: never

/** Makes all properties optional recursively — useful for form defaults where fields start empty */
export type DeepPartial<T> = T extends Date
	? T
	: T extends Array<infer U>
		? DeepPartial<U>[]
		: T extends object
			? { [K in keyof T]?: DeepPartial<T[K]> }
			: T
