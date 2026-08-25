// packages/app/react/src/storybook/connected.typecheck.ts
// Compile-time smoke for the connected-stories helpers — NO runtime, NO test runner. `bun x tsc` is
// the check. This is intentionally NOT a *.test.ts (those are excluded from the workspace tsconfig),
// so tsc type-checks every call here; if an SDK response/param shape drifts, the build fails here.
import { getMyAccountQueryOptions } from '@codm/client-typescript/typescript'
import { updateOwnerSettingsMutationOptions } from '@codm/client-typescript/typescript-cloud'

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

	// AC-7: session typed off the app's own useSession — que agora vem do CLIENT REAL do better-auth,
	// não mais do stub de operador constante. O tipo deixou de ser inventável: `createdAt`/`updatedAt`
	// e `token` são o que o servidor devolve, e o `ownerId` que estava aqui NÃO existe no shape base
	// (o backend o guarda como `active_owner_id` na sessão, e expô-lo ao client pede
	// `inferAdditionalFields` — trabalho da migração de identidade, não deste mock).
	const now = new Date('2026-01-01T00:00:00.000Z')
	void mockSession({
		user: {
			id: 'operator',
			email: 'operator@codm.local',
			name: 'Operator',
			image: null,
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
		},
		session: {
			id: 'operator',
			userId: 'operator',
			token: 'stub-session-token',
			expiresAt: new Date('2999-12-31T00:00:00.000Z'),
			createdAt: now,
			updatedAt: now,
		},
	})

	// AC-10: route is required; stores is the (currently empty) typed StoresParam.
	void connected({ route: { id: '/(app)/dashboard/' } })
}
