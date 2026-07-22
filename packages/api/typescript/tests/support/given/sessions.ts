// Creates a session row directly in the database for testing auth endpoints.
import { DrizzleClient } from '@template/core-typescript'
import { sessions } from '@template/contracts/db'
import type { TestBed } from '../TestBed'
import { uniqueId } from './sequence'

export async function givenActiveSession(testBed: TestBed, userId: string): Promise<string> {
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

	return token
}
