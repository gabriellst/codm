// packages/app/react/src/storybook/connected.typecheck.ts
// Compile-time smoke for the connected-stories helpers — NO runtime, NO test runner. `bun x tsc` is
// the check. This is intentionally NOT a *.test.ts (those are excluded from the workspace tsconfig),
// so tsc type-checks every call here; if an SDK response/param shape drifts, the build fails here.
import { getMyAccountQueryOptions, updateProfileMutationOptions } from '@template/client-typescript/typescript'

import { connected, errorQuery, loadingQuery, mockMutation, mockMutationError, mockQuery, mockSession } from '.'

// Exported so noUnusedLocals is satisfied; never imported by the app, so it tree-shakes out of builds.
export function connectedTypecheck() {
	const account = getMyAccountQueryOptions()
	// AC-4: response type inferred from the SDK options; a DeepPartial of the real shape compiles, cast-free.
	void mockQuery(account, { profile: { name: 'Test User' } })
	void loadingQuery(account)
	void errorQuery(account, 400)

	const updateProfile = updateProfileMutationOptions()
	// AC-6: mutation url + response inferred; method is an explicit write verb.
	void mockMutation('patch', updateProfile, {})
	void mockMutationError('patch', updateProfile, 409)

	// AC-7: session typed off the app's own useSession.
	void mockSession(null)

	// AC-10: route is required; stores is the (currently empty) typed StoresParam.
	void connected({ route: { id: '/(app)/dashboard/' } })
}
