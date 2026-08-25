import { injectable } from 'tsyringe-neo'
import { ContactAvatarStore, type ContactAvatarBytes } from './ContactAvatarStore'

/**
 * Test/dev double, bound in `mock` AND `integration`: no socket, no data dir.
 *
 * Empty by default, which is the honest default — a remote whose `avatar_url` nobody seeded has no
 * photo, and the endpoint's 404 branch is the one every suite gets for free. A suite that needs
 * BYTES calls `seed(url, …)` first, so "the store answered" is always something the test asked for
 * rather than something the network happened to allow.
 */
@injectable()
export class MockContactAvatarStore extends ContactAvatarStore {
	private readonly byUrl = new Map<string, ContactAvatarBytes>()

	async get(sourceUrl: string): Promise<ContactAvatarBytes | undefined> {
		return this.byUrl.get(sourceUrl)
	}

	/** Test helper — the photo this store will answer with for `sourceUrl`. */
	seed(sourceUrl: string, avatar: ContactAvatarBytes): void {
		this.byUrl.set(sourceUrl, avatar)
	}
}
