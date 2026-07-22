// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { injectable } from 'tsyringe-neo'
import { UserDirectoryEntry, UserDirectoryService } from './UserDirectoryService'

@injectable()
export class MockUserDirectoryService extends UserDirectoryService {
	// Deterministic stubs — OwnerMembers (T10) is testable without P1-IDENTITY.
	async getMany(userIds: string[]): Promise<UserDirectoryEntry[]> {
		return userIds.map(userId => ({
			userId,
			email: `u-${userId.slice(0, 4)}@mock.local`,
			name: 'Mock User',
			image: null,
		}))
	}
}
