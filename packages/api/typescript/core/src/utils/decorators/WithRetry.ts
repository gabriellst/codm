import { BaseError } from '../../types/BaseError'

/**
 * Calculates delay using full jitter strategy
 * Full jitter picks a random delay between 0 and baseDelay * attempt
 * This helps prevent thundering herd by maximally spreading out retry attempts
 *
 * @param attempt Current attempt number (1-based)
 * @param baseDelay Base delay in milliseconds
 */
function calculateDelay(attempt: number, baseDelay = 20): number {
	// add jitter
	const jitter = Math.random() * baseDelay * 2
	const exp = Math.min(attempt - 1, 6) // Cap at 2^6
	const maxDelay = baseDelay * 2 ** exp
	return Math.floor(Math.random() * maxDelay) + jitter
}

export function WithRetry(maxRetries = 15) {
	return (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) => {
		const originalMethod = descriptor.value

		descriptor.value = async function (...args: any[]) {
			let lastError: Error | undefined

			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				try {
					return await originalMethod.apply(this, args)
				} catch (error) {
					lastError = error as Error

					if (error instanceof BaseError && error.name === 'ENTITY_NOT_FOUND_WHILE_SAVING') {
						if (attempt === maxRetries) {
							throw error // If we've exhausted all retries, throw the last error
						}

						// Wait using full jitter strategy
						const delay = calculateDelay(attempt)
						await new Promise(resolve => setTimeout(resolve, delay))
						continue
					}

					throw error // If it's not a race condition error, throw immediately
				}
			}

			throw lastError // This line should never be reached but TypeScript needs it
		}

		return descriptor
	}
}
