import { z } from 'zod'
import { useTypedSearchParams } from '@/lib/typed-route'
import { SessionScreen } from './-components/SessionScreen'

// Path param arrives through the same typed-params seam as query params, with a
// default so a garbage deep link renders the not-found state instead of crashing.
const schema = z.object({ threadId: z.string().default('') })

export default function ThreadRoute() {
	const [{ threadId }] = useTypedSearchParams(schema)
	return <SessionScreen threadId={threadId} />
}
