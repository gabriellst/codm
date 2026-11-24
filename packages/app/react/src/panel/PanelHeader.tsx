import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconStack2 } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import {
	getPanelIdentityQueryKey,
	getPanelIssueQueryKey,
	QuotaStateEnum,
	useForgetPanelDevice,
	useGetPanelBoard,
	useGetPanelIdentity,
	type QuotaState,
} from '@codm/client-typescript/typescript-cloud'
import { Button } from '@codm/app-ui/button'
import { enumLabel } from '@/lib/enums'
import { TASK_COLUMN_OF } from '@/lib/task/issueBoard'
import { cn } from '@/lib/utils'
import { useDialogStore } from '@/stores/useDialogStore'
import { IdentifyDialog } from './IdentifyDialog'
import { openHash } from './panelHash'
import { usePanelToken } from './panelToken'

/** "Aurora Labs" → "AL"; one word → its first two letters. */
export function initialsOf(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean)
	if (words.length === 0) return '?'
	if (words.length === 1) return (words[0] ?? '').slice(0, 2).toUpperCase()
	return `${words[0]?.[0] ?? ''}${words[words.length - 1]?.[0] ?? ''}`.toUpperCase()
}

/** "Ana Ribeiro" → "Ana" — the chip is short ("Você · Ana"); the full name shows where people are listed. */
function firstNameOf(name: string): string {
	return name.trim().split(/\s+/)[0] || name
}

/** The daemon counts as "in touch" while its last sync is at most this old (the old page's 2 min). */
const IN_TOUCH_MS = 2 * 60_000

/** The health dot's voice per quota state — a style map, not a label map (labels are the catalog's). */
const QUOTA_WARNS: Record<QuotaState, boolean> = {
	[QuotaStateEnum.OK]: false,
	[QuotaStateEnum.NEAR]: false,
	[QuotaStateEnum.HOLDING]: true,
	[QuotaStateEnum.REFUSED]: true,
}

/** A round initials badge (group, person). */
export function Initials({ name, className, ...props }: ComponentProps<'span'> & { name: string }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				'flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-bold text-primary',
				className,
			)}
			{...props}
		>
			{initialsOf(name)}
		</span>
	)
}

/** The group's name and its counts — the panel's title block. */
export function GroupTitle({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const token = usePanelToken()
	const { data: board } = useGetPanelBoard(token)
	if (!board) return null
	const done = board.issues.filter(issue => TASK_COLUMN_OF[issue.lifeState] === 'done').length
	return (
		<div className={cn('flex min-w-0 items-center gap-3', className)} {...props}>
			<Initials name={board.group.name} />
			<div className="min-w-0">
				<h1 className="truncate text-xl font-bold tracking-tight text-foreground">{board.group.name}</h1>
				<p className="truncate text-sm text-muted-foreground">{t('panel.board.counts', { open: board.issues.length - done, done })}</p>
			</div>
		</div>
	)
}

/**
 * The health line (parity with the old page): whether the codm is in touch ("sem contato com o codm há N min"
 * past 2 min), and the owner's quota — state, window %, week %, slots, queue. Percentages and states only.
 */
export function HealthLine({ className, ...props }: ComponentProps<'p'>) {
	const { t } = useTranslation()
	const token = usePanelToken()
	const { data: board } = useGetPanelBoard(token)
	if (!board) return null
	const parts: string[] = []
	let warn = false
	if (board.daemonLastSeenAt) {
		const ago = Date.now() - new Date(board.daemonLastSeenAt).getTime()
		const stale = ago > IN_TOUCH_MS
		warn ||= stale
		parts.push(stale ? t('panel.health.stale', { count: Math.round(ago / 60_000) }) : t('panel.health.now'))
	}
	const health = board.health
	if (health) {
		warn ||= QUOTA_WARNS[health.state]
		parts.push(
			enumLabel('QuotaState', health.state),
			t('panel.health.window', { percent: Math.round(health.windowPercent) }),
			t('panel.health.week', { percent: Math.round(health.weekPercent) }),
			t('panel.health.slots', { inUse: health.slots.inUse, effective: health.slots.effective }),
		)
		if (health.queuePending > 0) parts.push(t('panel.health.queue', { count: health.queuePending }))
	}
	if (parts.length === 0) return null
	return (
		<p
			data-testid="panel-health"
			data-warn={warn || undefined}
			className={cn(
				'flex min-w-0 items-center gap-2 rounded-asymmetric-sm bg-muted px-3 py-1.5 font-mono text-xs text-muted-foreground data-warn:text-attention-foreground',
				className,
			)}
			{...props}
		>
			<span aria-hidden="true" className={cn('size-1.75 shrink-0 rounded-full', warn ? 'bg-status-attention' : 'bg-success-bright')} />
			<span className="min-w-0">{parts.join(' · ')}</span>
		</p>
	)
}

/** One chip per batch the board carries (newest first) — each opens its `#L-n`. */
export function BatchChips({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const token = usePanelToken()
	const { data: board } = useGetPanelBoard(token)
	const batches = board?.batches ?? []
	if (batches.length === 0) return null
	return (
		<div className={cn('flex flex-wrap items-center gap-2', className)} {...props}>
			{batches.map(batch => (
				<Button key={batch.code} variant="secondary" size="sm" onClick={() => openHash(batch.code)}>
					<IconStack2 className="size-4" />
					{t('panel.batchChip', { code: batch.code })}
				</Button>
			))}
		</div>
	)
}

/**
 * Who this device is (fase 2, item 6a): "Você · Ana" with "Sair", or "Identificar-me". The device token lives in
 * an HttpOnly cookie the page never sees; `/me` says who it belongs to. Leaving re-reads what this person may
 * do — the identity and the open task.
 */
export function IdentityChip({ compact = false, className, ...props }: ComponentProps<'div'> & { compact?: boolean }) {
	const { t } = useTranslation()
	const token = usePanelToken()
	const queryClient = useQueryClient()
	const show = useDialogStore(state => state.show)
	const { data: me, isError } = useGetPanelIdentity(token)
	const forget = useForgetPanelDevice({
		mutation: {
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: getPanelIdentityQueryKey(token) })
				queryClient.invalidateQueries({ queryKey: [{ url: getPanelIssueQueryKey(token, undefined)[0].url }] })
			},
		},
	})
	if (isError || !me) return null
	const member = me.member
	if (!member) {
		return (
			<div className={cn('flex items-center', className)} {...props}>
				<Button variant="outline" size="sm" onClick={() => show(<IdentifyDialog />)}>
					{t('panel.identity.identify')}
				</Button>
			</div>
		)
	}
	return (
		<div className={cn('flex min-w-0 items-center gap-1.5', className)} {...props}>
			<span
				data-testid="panel-identity"
				className="flex min-w-0 items-center gap-2 rounded-asymmetric-sm bg-muted py-1 pr-3 pl-1 text-sm font-semibold text-foreground"
			>
				<Initials name={member.name} className="size-6.5 text-[10px]" />
				<span className="truncate">
					{t('panel.identity.you', { name: firstNameOf(member.name) })}
					{!compact && member.canRelease && (
						<span className="hidden font-normal text-muted-foreground md:inline"> · {t('panel.identity.canRelease')}</span>
					)}
				</span>
			</span>
			<Button variant="ghost" size="sm" disabled={forget.isPending} onClick={() => forget.mutate({ token })}>
				{t('panel.identity.forget')}
			</Button>
		</div>
	)
}
