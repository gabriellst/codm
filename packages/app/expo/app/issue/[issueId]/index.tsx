import { z } from 'zod'
import { useTypedSearchParams } from '@/lib/typed-route'
import { IssueDetailScreen } from './-components/IssueDetailScreen'

const schema = z.object({ issueId: z.string().default('') })

export default function IssueRoute() {
	const [{ issueId }] = useTypedSearchParams(schema)
	return <IssueDetailScreen issueId={issueId} />
}
