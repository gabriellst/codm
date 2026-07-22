// Recipe: dev:packages/api/src/auth/entities/Account.ts
import { AggregateRoot } from '@template/core-typescript'
import { Id } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import Z from 'zod'

const AccountSchema = z.object({
	accountId: z.string(),
	providerId: z.string(),
	userId: z.instance(Id),
})

export type AccountProps = Z.infer<typeof AccountSchema>

export class Account extends AggregateRoot<typeof AccountSchema> {
	static override schema = AccountSchema

	static create(data: { accountId: string; providerId: string; userId: string }): Account {
		return new Account(data)
	}
}

export interface Account extends AccountProps {}
