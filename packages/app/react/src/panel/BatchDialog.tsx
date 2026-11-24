import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useGetPanelBoard, type BatchItemDestination, type GetPanelBoardQueryResponse } from '@codm/client-typescript/typescript-cloud'
import { Button } from '@codm/app-ui/button'
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@codm/app-ui/dialog'
import { enumLabel } from '@/lib/enums'
import { cn } from '@/lib/utils'
import { useDialogStore } from '@/stores/useDialogStore'
import { openHash } from './panelHash'
import { usePanelToken } from './panelToken'

type Batch = GetPanelBoardQueryResponse['batches'][number]
type BatchItem = Batch['items'][number]
type Kind = BatchItemDestination['kind']
type DestinationOf<K extends Kind> = Extract<BatchItemDestination, { kind: K }>

/** What a destination says beyond its kind — the task it went to, and why (CMP-P18: one entry per variant). */
const DESTINATION: { [K in Kind]: (destination: DestinationOf<K>) => { issueId?: string; why?: string } } = {
	NEW_ISSUE: destination => ({ issueId: destination.issueId }),
	ATTACHED: destination => ({ issueId: destination.issueId }),
	ALREADY_LIVE: destination => ({ issueId: destination.issueId, why: destination.note }),
	DECLINED: destination => ({ why: destination.reason }),
	DEFERRED: destination => ({ why: destination.reason }),
	NEEDS_DECISION: destination => ({ issueId: destination.issueId }),
}

/**
 * A BATCH (`#L-31`, fase 4 item 5): each item of the message that carried several asks, where it went (the
 * catalog's destination label), why, and — when the board has it — the task it became, one tap away. Opened by
 * the hash; closing drops the hash (the panel's dialog host does it).
 */
export function BatchDialog({ code, className, ...props }: ComponentProps<typeof DialogContent> & { code: string }) {
	const { t } = useTranslation()
	const token = usePanelToken()
	const { data: board } = useGetPanelBoard(token)
	const batch = board?.batches.find(candidate => candidate.code === code)
	return (
		<DialogContent data-testid="panel-batch" className={cn('max-h-[85dvh] overflow-y-auto sm:max-w-lg', className)} {...props}>
			<DialogHeader>
				<DialogTitle>{t('panel.batch.title', { code })}</DialogTitle>
				<DialogDescription>{batch ? enumLabel('BatchStatus', batch.status) : t('panel.batch.empty')}</DialogDescription>
			</DialogHeader>
			{batch && (
				<ol className="flex flex-col divide-y divide-border">
					{batch.items.map(item => (
						<BatchItemRow key={item.n} item={item} />
					))}
				</ol>
			)}
		</DialogContent>
	)
}

function BatchItemRow({ item, className, ...props }: ComponentProps<'li'> & { item: BatchItem }) {
	const { t } = useTranslation()
	const token = usePanelToken()
	const { data: board } = useGetPanelBoard(token)
	const hide = useDialogStore(state => state.hide)
	const destination = item.destination
	// TS cannot correlate `DESTINATION[kind]` with `destination` across a union; the map's own type keeps each entry honest.
	const facts = destination
		? (DESTINATION[destination.kind] as (d: BatchItemDestination) => { issueId?: string; why?: string })(destination)
		: {}
	const task = facts.issueId ? board?.issues.find(issue => issue.issueId === facts.issueId) : undefined
	return (
		<li className={cn('flex flex-col gap-1.5 py-3', className)} {...props}>
			<p className="text-xs font-semibold text-foreground">
				{t('panel.batch.item', {
					n: item.n,
					destination: destination ? enumLabel('BatchItemDestinationKind', destination.kind) : t('panel.batch.noDestination'),
				})}
			</p>
			<p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.excerpt}</p>
			{facts.why && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{facts.why}</p>}
			{task && (
				<Button
					variant="outline"
					size="sm"
					className="w-fit max-w-full justify-start truncate"
					onClick={() => {
						hide()
						openHash(task.key)
					}}
				>
					<span className="font-mono font-bold">{task.key}</span>
					<span className="truncate">{task.title}</span>
				</Button>
			)}
		</li>
	)
}
