import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@codm/core-typescript'
import { Account } from '../../entities/Account'
import { AccountRepository } from './AccountRepository'

@injectable()
export class MockAccountRepository extends AccountRepository {
	private store = new Map<string, Account>()

	async findById(id: string, _tx?: Transaction): Promise<Account | undefined> {
		return this.store.get(id)
	}

	async findByAccountId(accountId: string, _tx?: Transaction): Promise<Account[]> {
		return [...this.store.values()].filter(a => a.accountId === accountId)
	}

	async findByUserId(userId: string, _tx?: Transaction): Promise<Account[]> {
		return [...this.store.values()].filter(a => a.userId.value === userId)
	}

	async save(entity: Account, _tx?: Transaction): Promise<Account> {
		this.store.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string, _tx?: Transaction): Promise<void> {
		this.store.delete(id)
	}

	seed(account: Account): void {
		this.store.set(account.id.value, account)
	}

	clear(): void {
		this.store.clear()
	}
}
