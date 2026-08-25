// Sequence helpers for generating unique test data.
let counter = 0

export function uniqueId(): number {
	return ++counter
}

export function defaultEmail(): string {
	return `user-${uniqueId()}@example.com`
}

export function defaultName(): string {
	return `Test User ${uniqueId()}`
}
