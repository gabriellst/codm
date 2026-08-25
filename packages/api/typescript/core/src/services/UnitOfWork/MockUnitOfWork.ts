import { UnitOfWork } from './UnitOfWork'
import { injectable } from 'tsyringe-neo'

export interface MockTransaction {
	operations: Array<{ type: string; data: unknown; timestamp: Date }>
	committed: boolean
	rolledBack: boolean
}

@injectable()
export class MockUnitOfWork extends UnitOfWork<MockTransaction> {
	private currentTransaction: MockTransaction | null = null

	async transaction<T>(fn: (tx: MockTransaction) => Promise<T>): Promise<T> {
		// Create a new mock transaction
		this.currentTransaction = {
			operations: [],
			committed: false,
			rolledBack: false,
		}

		try {
			// Execute the function with the mock transaction
			const result = await fn(this.currentTransaction)

			// Mark as committed
			this.currentTransaction.committed = true

			return result
		} catch (error) {
			// Mark as rolled back
			if (this.currentTransaction) {
				this.currentTransaction.rolledBack = true
			}
			throw error
		} finally {
			// Clear the transaction
			this.currentTransaction = null
		}
	}

	// Helper methods for testing
	getCurrentTransaction(): MockTransaction | null {
		return this.currentTransaction
	}

	addOperation(type: string, data: unknown): void {
		if (this.currentTransaction) {
			this.currentTransaction.operations.push({
				type,
				data,
				timestamp: new Date(),
			})
		}
	}

	getOperations(): Array<{ type: string; data: unknown; timestamp: Date }> {
		return this.currentTransaction?.operations || []
	}

	isCommitted(): boolean {
		return this.currentTransaction?.committed || false
	}

	isRolledBack(): boolean {
		return this.currentTransaction?.rolledBack || false
	}
}

@injectable()
export class MockUnitOfWorkFactory {
	create(): UnitOfWork<unknown> {
		return new MockUnitOfWork()
	}
}
