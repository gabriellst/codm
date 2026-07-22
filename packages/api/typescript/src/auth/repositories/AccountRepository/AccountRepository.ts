// Recipe: dev:packages/api/src/auth/repositories/AccountRepository/AccountRepository.ts
import { Repository } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { Account } from '../../entities'

export abstract class AccountRepository extends Repository<Account> {
	abstract findById(id: string, tx?: Transaction): Promise<Account | undefined>
	abstract findByAccountId(accountId: string, tx?: Transaction): Promise<Account[]>
	abstract findByUserId(userId: string, tx?: Transaction): Promise<Account[]>
}
