// Single-operator seam — CodeDM has no accounts, no sign-in, and no better-auth client. The web
// console always runs as the constant operator (founder decision 2), so the "session" is a
// compile-time constant with no network round-trip. `useSession` returns it unchanged and `signOut`
// is a no-op; swapping a real auth client back in is a one-file change here.
const OPERATOR_SESSION = {
	user: {
		id: 'operator',
		email: 'operator@codedm.local',
		name: 'Operator',
		image: null as string | null,
		emailVerified: true,
	},
	session: {
		id: 'operator',
		userId: 'operator',
		expiresAt: new Date('2999-12-31T00:00:00.000Z'),
		ownerId: 'operator',
	},
}

export const auth = {
	useSession: () => ({ data: OPERATOR_SESSION, isPending: false, error: null }),
	signOut: async () => {},
}
