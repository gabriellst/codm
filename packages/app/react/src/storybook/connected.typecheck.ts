// packages/app/react/src/storybook/connected.typecheck.ts
// Compile-time smoke for the connected-stories helpers — NO runtime, NO test runner. `bun x tsc` is
// the check. This is intentionally NOT a *.test.ts (those are excluded from the workspace tsconfig),
// so tsc type-checks every call here; if an SDK response/param shape drifts, the build fails here.
import { getMyAccountQueryOptions, updateOwnerSettingsMutationOptions } from '@codedm/client-typescript/typescript'

import { connected, errorQuery, loadingQuery, mockMutation, mockMutationError, mockQuery, mockSession } from '.'

// Exported so noUnusedLocals is satisfied; never imported by the app, so it tree-shakes out of builds.
export function connectedTypecheck() {
	const account = getMyAccountQueryOptions()
	// AC-4: response type inferred from the SDK options; a DeepPartial of the real shape compiles, cast-free.
	void mockQuery(account, { profile: { name: 'Test User' } })
	void loadingQuery(account)
	void errorQuery(account, 400)

	const updateOwnerSettings = updateOwnerSettingsMutationOptions()
	// AC-6: mutation url + response inferred; method is an explicit write verb.
	void mockMutation('patch', updateOwnerSettings, {})
	void mockMutationError('patch', updateOwnerSettings, 409)

	// AC-7: session typed off the app's own useSession. After the operator collapse the session is
	// a non-null constant, so the mock takes the operator-shaped session (no unauthenticated case).
	void mockSession({
		user: { id: 'operator', email: 'operator@codedm.local', name: 'Operator', image: null, emailVerified: true },
		session: { id: 'operator', userId: 'operator', expiresAt: new Date('2999-12-31T00:00:00.000Z'), ownerId: 'operator' },
	})

	// AC-10: route is required; stores is the (currently empty) typed StoresParam.
	void connected({ route: { id: '/(app)/dashboard/' } })
}
