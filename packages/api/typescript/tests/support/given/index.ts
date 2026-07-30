import type { TestBed } from '../TestBed'
import { givenUser, givenAccount, givenUserWithAccount } from './users'
import { givenActiveSession } from './sessions'
import { givenOwner, givenOwnerWithResponsible } from './owners'

export type GivenHelpers = ReturnType<typeof createGivenHelpers>

/**
 * @deprecated Prefer the bare `givenX(testBed, …)` helpers (TST-18). This facade
 * is retained only for existing call sites and is not the documented path.
 */
export function createGivenHelpers(testBed: TestBed) {
	return {
		user: (overrides?: Parameters<typeof givenUser>[1]) => givenUser(testBed, overrides),
		account: (userId: string, overrides?: Parameters<typeof givenAccount>[2]) => givenAccount(testBed, userId, overrides),
		userWithAccount: (overrides?: Parameters<typeof givenUserWithAccount>[1]) => givenUserWithAccount(testBed, overrides),
		activeSession: (userId: string) => givenActiveSession(testBed, userId),
		owner: (overrides?: Parameters<typeof givenOwner>[1]) => givenOwner(testBed, overrides),
		ownerWithResponsible: (overrides?: Parameters<typeof givenOwnerWithResponsible>[1]) => givenOwnerWithResponsible(testBed, overrides),
	}
}

export { givenUser, givenAccount, givenUserWithAccount, givenActiveSession }
export { givenOwner, givenOwnerWithResponsible } from './owners'
export { givenWorkspace } from './workspaces'
export { givenThread, GIVEN_MENTION_TAG } from './threads'
export { givenChannel } from './channels'
export { givenRemote } from './remotes'
export { givenIssue } from './issues'
export { givenStop } from './stops'
export { givenDomainEvent } from './events'
export { givenUserProfile } from './identity'
