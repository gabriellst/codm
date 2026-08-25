import { auth } from '@/lib'

export const useSession = () => {
	const { data: session } = auth.useSession()
	return session
}
