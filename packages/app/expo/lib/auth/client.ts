// Single-operator seam — CodeDM has no accounts, no better-auth, and no SecureStore-backed session.
// The native app always runs as the constant operator (founder decision 2), so `useSession` returns
// it with no round-trip and `signOut` is a no-op. Swapping a real RN auth client back in is a
// one-file change here.
const OPERATOR_USER = {
	id: 'operator',
	name: 'Operator' as string | null,
	email: 'operator@codedm.local' as string | null,
	image: null as string | null,
}

export const auth = {
	useSession: () => ({
		data: { user: OPERATOR_USER } as { user: typeof OPERATOR_USER } | null,
		isPending: false,
		error: null as Error | null,
		refetch: () => {},
	}),
	signOut: async () => {},
}
