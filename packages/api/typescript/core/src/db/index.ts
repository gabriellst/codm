import { container } from 'tsyringe-neo'
import { DrizzleDatabaseDriver } from './drivers/DrizzleDatabaseDriver'

export * from './client'
export * from './utils'
export * from './saveWithOptimisticLock'
export * from './drivers'

export async function closeDatabase(): Promise<void> {
	try {
		// biome-ignore lint/suspicious/noExplicitAny: tsyringe-neo abstract-class token erases generics
		const driver = container.resolve(DrizzleDatabaseDriver as any) as DrizzleDatabaseDriver
		await driver.close()
		console.log('✅ Database connections closed')
	} catch (error) {
		console.error('❌ Error closing database connections:', error)
	}
}
