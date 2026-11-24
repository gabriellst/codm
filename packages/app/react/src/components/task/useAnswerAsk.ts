import { useQueryClient } from '@tanstack/react-query'
import {
	answerStopMutationRequestSchema,
	getHomeDashboardQueryKey,
	getIssueDetailQueryKey,
	getIssueTimelineQueryKey,
	getNeedsYouPanelQueryKey,
	getSessionChatQueryKey,
	useAnswerStop,
	AskAnswerKindEnum,
} from '@codm/client-typescript/typescript'
import { pickUnionVariantField } from '@/lib/union'

/** The free-text answer, validated by the SDK's own TEXT member — never a hand-rolled rule. */
export const answerTextSchema = pickUnionVariantField(answerStopMutationRequestSchema, { kind: AskAnswerKindEnum.TEXT }, 'text')

/**
 * The console's answer to an open ask (`POST /stops/:stopId/answer`, as the operator), with the reads it
 * makes stale — on the HOOK, so it survives the card unmounting once the stop leaves the list. Shared by the
 * needs-you card and the task conversation.
 */
export function useAnswerAsk({ threadId, issueId }: { threadId: string; issueId?: string }) {
	const queryClient = useQueryClient()
	return useAnswerStop({
		mutation: {
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: getNeedsYouPanelQueryKey(threadId) })
				queryClient.invalidateQueries({ queryKey: getSessionChatQueryKey(threadId) })
				queryClient.invalidateQueries({ queryKey: getHomeDashboardQueryKey() })
				if (issueId) {
					queryClient.invalidateQueries({ queryKey: getIssueDetailQueryKey(issueId) })
					queryClient.invalidateQueries({ queryKey: getIssueTimelineQueryKey(issueId) })
				}
			},
		},
	})
}
