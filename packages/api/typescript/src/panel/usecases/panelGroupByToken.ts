import { eq } from 'drizzle-orm'
import type { PgDatabaseDriver } from '@codm/core-typescript'
import { panelGroups } from '@codm/contracts/db/pg'

/** The group a link token opens, or nothing. Shared by the two public reads. */
export async function panelGroupByToken(driver: PgDatabaseDriver, token: string) {
	const [group] = await driver.db.select().from(panelGroups).where(eq(panelGroups.token, token)).limit(1)
	return group
}
