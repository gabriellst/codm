type TryCatchResult<T> = { success: true; data: T } | { success: false; error: Error }

export async function tryCatchAsync<T>(fn: () => Promise<T>): Promise<TryCatchResult<T>> {
	try {
		const data = await fn()
		return { success: true, data }
	} catch (error) {
		return { success: false, error: error as Error }
	}
}

export function tryCatch<T>(fn: () => T): TryCatchResult<T> {
	try {
		const data = fn()
		return { success: true, data }
	} catch (error) {
		return { success: false, error: error as Error }
	}
}
