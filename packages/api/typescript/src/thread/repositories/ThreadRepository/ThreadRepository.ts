import { Repository } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { Thread } from '../../entities/Thread'

export abstract class ThreadRepository extends Repository<Thread> {
	abstract findById(id: string, tx?: Transaction): Promise<Thread | undefined>
	// Attach dedupe + inbound routing: one thread per (channel, contact) per owner.
	abstract findByChannelContact(channelId: string, contactExternalId: string, tx?: Transaction): Promise<Thread | undefined>
	abstract listByOwner(ownerId: string, tx?: Transaction): Promise<Thread[]>
}
