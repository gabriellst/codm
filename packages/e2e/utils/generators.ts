/**
 * Generates a valid Brazilian CPF with correct check digits.
 * Each call returns a unique CPF.
 */
export function generateCpf(): string {
	const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10))

	// First check digit
	let sum = 0
	for (let i = 0; i < 9; i++) sum += digits[i] * (10 - i)
	let remainder = (sum * 10) % 11
	digits.push(remainder === 10 ? 0 : remainder)

	// Second check digit
	sum = 0
	for (let i = 0; i < 10; i++) sum += digits[i] * (11 - i)
	remainder = (sum * 10) % 11
	digits.push(remainder === 10 ? 0 : remainder)

	return digits.join('')
}

/**
 * Generates a unique email with a timestamp + random suffix.
 */
export function generateEmail(prefix = 'e2e'): string {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`
}

/**
 * Generates a CRM number (6-7 digits).
 */
export function generateCrm(): string {
	return String(100000 + Math.floor(Math.random() * 900000))
}

/**
 * Generates a valid Brazilian RG number.
 */
export function generateRg(): string {
	return String(10000000 + Math.floor(Math.random() * 89999999))
}

/**
 * Returns a future date string in ISO format, offset by days from today.
 */
export function futureDate(daysFromNow: number): Date {
	const date = new Date()
	date.setDate(date.getDate() + daysFromNow)
	return date
}

/**
 * Returns a date with specific hour/minute on a future day.
 */
export function futureDateAt(daysFromNow: number, hour: number, minute = 0): Date {
	const date = futureDate(daysFromNow)
	date.setHours(hour, minute, 0, 0)
	return date
}
