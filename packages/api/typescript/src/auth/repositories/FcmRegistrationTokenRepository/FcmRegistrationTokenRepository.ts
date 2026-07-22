import { Repository } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { FcmRegistrationToken } from '../../entities/FcmRegistrationToken'

export abstract class FcmRegistrationTokenRepository extends Repository<FcmRegistrationToken> {
	abstract findByToken(token: string, tx?: Transaction): Promise<FcmRegistrationToken | undefined>
	abstract listByUserId(userId: string, tx?: Transaction): Promise<FcmRegistrationToken[]>
}
