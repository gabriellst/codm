// Creates a session row directly in the database for testing auth endpoints.
//
// TRONCO DE NUVEM: sessões são do contexto `auth`, que é CLOUD-ONLY (ADR 0002), e suas tabelas vivem
// em `db/cloud` sob a família pg (ADR 0005). Este helper semeava na `sessions` do tronco SQLite —
// que passou a não existir para quem o consome — e falhava com `undefined is not an object
// (evaluating 'db.insert')`, porque `LibSqlDatabaseDriver` nem está bound num TestBed de família pg.
import { PgDatabaseDriver } from '@codm/core-typescript'
import { sessions } from '@codm/contracts/db/pg'
import type { TestBedLike } from './types'
import { uniqueId } from './sequence'

export async function givenActiveSession(testBed: TestBedLike, userId: string): Promise<{ sessionId: string; token: string }> {
	const db = testBed.resolve(PgDatabaseDriver).db
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
