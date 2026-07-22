// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
export interface UserDirectoryEntry {
	userId: string
	email: string
	name: string | null
	image?: string | null
}

// Port: P1-IDENTITY's `auth.users` lookup feeds the OwnerMembers (T10)
// read so member rows can be hydrated with email + display name without
// pulling the whole UserProfile aggregate per member.
export abstract class UserDirectoryService {
	abstract getMany(userIds: string[]): Promise<UserDirectoryEntry[]>
}
