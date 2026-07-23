// Creates a session row directly in the database for testing auth endpoints.
import { DrizzleClient } from '@codedm/core-typescript'
import { sessions } from '@codedm/contracts/db'
import type { TestBed } from '../TestBed'
import { uniqueId } from './sequence'

export async function givenActiveSession(testBed: TestBed, userId: string): Promise<{ sessionId: string; token: string }> {
	const db = testBed.resolve(DrizzleClient)
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
