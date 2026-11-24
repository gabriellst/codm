import { useEffect, useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
	getPanelBoardQueryKey,
	getPanelIssueQueryKey,
	PanelActionStatusEnum,
	useGetPanelAction,
	type GetPanelActionQueryResponse,
} from '@codm/client-typescript/typescript-cloud'
import { cn } from '@/lib/utils'
import { useErrorText } from './panelErrors'
import { usePanelToken } from './panelToken'
import { usePanelActionStore, type LastAction } from './usePanelAction'

/** How long the panel keeps asking about one action before it says nobody answered (the old page's 4 min). */
const ACTION_PATIENCE_MS = 4 * 60_000
/** How often it asks while the action is pending. */
const ACTION_POLL_MS = 3_000

type Outcome = 'sent' | 'done' | 'refused' | 'noAnswer'

/** Where an action stands, from what `GET /actions/:id` said and whether the patience ran out. */
function outcomeOf(action: GetPanelActionQueryResponse | undefined, failed: boolean, expired: boolean): Outcome {
	if (failed) return 'noAnswer'
	if (!action) return expired ? 'noAnswer' : 'sent'
	const byStatus: Record<GetPanelActionQueryResponse['status'], Outcome> = {
		[PanelActionStatusEnum.PENDING]: expired ? 'noAnswer' : 'sent',
		[PanelActionStatusEnum.DONE]: 'done',
		[PanelActionStatusEnum.REFUSED]: 'refused',
		[PanelActionStatusEnum.EXPIRED]: 'noAnswer',
	}
	return byStatus[action.status]
}

/**
 * The action status line (parity with the old page): "Pedido enviado…" right after the POST, then the outcome —
 * done, refused with why (the catalog's sentence for the code), or no answer. Shows only the last action, and
 * only on the task it was about.
 */
export function PanelActionStatus({ issueId, className, ...props }: ComponentProps<'p'> & { issueId: string }) {
	const last = usePanelActionStore(state => state.last)
	if (!last || last.issueId !== issueId) return null
	return (
		<p role="status" data-testid="panel-action-status" className={cn('text-xs text-muted-foreground', className)} {...props}>
			<ActionLine last={last} />
		</p>
	)
}

function ActionLine({ last }: { last: LastAction }) {
	const { t } = useTranslation()
	const errorText = useErrorText()
	switch (last.state) {
		case 'sending':
			return t('panel.action.sending')
		case 'failed':
			return errorText(last.code)
		case 'sent':
			return <SentAction key={last.actionId} actionId={last.actionId} sentAt={last.sentAt} />
		default: {
			const _exhaustive: never = last
			return _exhaustive
		}
	}
}

function SentAction({ actionId, sentAt }: { actionId: string; sentAt: number }) {
	const { t } = useTranslation()
	const errorText = useErrorText()
	const token = usePanelToken()
	const queryClient = useQueryClient()
	// The patience is a deadline, not a poll: `refetchInterval` returning false re-renders nothing, so the
	// "no answer" line needs its own timer — truly local transient UI (state placement, case 5).
	const [expired, setExpired] = useState(() => Date.now() - sentAt >= ACTION_PATIENCE_MS)
	useEffect(() => {
		const timer = setTimeout(() => setExpired(true), Math.max(0, sentAt + ACTION_PATIENCE_MS - Date.now()))
		return () => clearTimeout(timer)
	}, [sentAt])
	// POLLING, ON PURPOSE (spec 13/11, review L9): the panel has no event stream — the daemon executes the action
	// on its next sync (~15 s) — so the outcome is asked for every 3 s, and ONLY while it is still pending.
	const { data, isError } = useGetPanelAction(token, actionId, {
		query: {
			refetchInterval: query =>
				!expired && (query.state.data === undefined || query.state.data.status === PanelActionStatusEnum.PENDING) ? ACTION_POLL_MS : false,
		},
	})
	const outcome = outcomeOf(data, isError, expired)

	// Once the action ends, what it changed is re-read: the board and the open task.
	useEffect(() => {
		if (outcome === 'sent') return
		queryClient.invalidateQueries({ queryKey: getPanelBoardQueryKey(token) })
		queryClient.invalidateQueries({ queryKey: [{ url: getPanelIssueQueryKey(token, undefined)[0].url }] })
	}, [outcome, queryClient, token])

	const words: Record<Outcome, () => string> = {
		sent: () => t('panel.action.sent'),
		done: () => t('panel.action.done'),
		refused: () => t('panel.action.refused', { reason: errorText(data?.code, t('panel.action.refusedGeneric')) }),
		noAnswer: () => t('panel.action.noAnswer'),
	}
	return words[outcome]()
}
