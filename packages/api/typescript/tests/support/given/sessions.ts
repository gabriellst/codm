// Creates a session row directly in the database for testing auth endpoints.
import { DrizzleDatabaseDriver } from '@codm/core-typescript'
import { sessions } from '@codm/contracts/db'
import type { TestBedLike } from './types'
import { uniqueId } from './sequence'

export async function givenActiveSession(testBed: TestBedLike, userId: string): Promise<{ sessionId: string; token: string }> {
	const db = testBed.resolve(DrizzleDatabaseDriver).db
	const sessionId = `session-${uniqueId()}`
	const token = `token-${sessionId}`

	await db.insert(sessions).values({
		id: sessionId,
		token,
		userId,
		expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
		createdAt: new Date(),
		updatedAt: new Date(),
	})

	return { sessionId, token }
}
