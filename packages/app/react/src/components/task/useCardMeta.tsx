import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconAlertTriangle, IconClock, IconMessageQuestion, IconPaperclip, IconPlayerPause, IconRefresh } from '@tabler/icons-react'
import { useLocale } from '@/hooks/useLocale'
import { enumLabel } from '@/lib/enums'
import { formatTimeOfDay } from '@/lib/format'
import type { CardMeta } from '@/lib/task/cardMeta'

/** The `TaskCard` props that carry a card's bottom line. */
export interface CardMetaProps {
	meta?: ReactNode
	metaIcon?: ReactNode
	metaTone?: 'default' | 'strong' | 'warn'
}

type MetaOf<K extends CardMeta['kind']> = Extract<CardMeta, { kind: K }>

/** One renderer per kind of bottom line (CMP-P18); words from the catalog, icons from the house set. */
const RENDER: {
	[K in CardMeta['kind']]: (meta: MetaOf<K>, t: ReturnType<typeof useTranslation>['t'], time: (iso: string) => string) => CardMetaProps
} = {
	ask: (meta, t) => ({
		meta: t('task.cardMeta.askCode', { code: meta.code, question: meta.question }),
		metaIcon: <IconMessageQuestion />,
		metaTone: 'strong',
	}),
	retryAt: (meta, t, time) => ({ meta: t('task.cardMeta.retryAt', { time: time(meta.at) }), metaIcon: <IconRefresh /> }),
	backAt: (meta, t, time) => ({ meta: t('task.cardMeta.backAt', { time: time(meta.at) }), metaIcon: <IconClock /> }),
	state: meta => ({ meta: enumLabel('IssueLifeState', meta.lifeState) }),
	escalated: (_meta, t) => ({ meta: t('task.cardMeta.escalated'), metaIcon: <IconAlertTriangle />, metaTone: 'warn' }),
	paused: (_meta, t) => ({ meta: t('task.cardMeta.paused'), metaIcon: <IconPlayerPause /> }),
	artifacts: (meta, t) => ({ meta: t('task.cardMeta.artifacts', { count: meta.count }), metaIcon: <IconPaperclip /> }),
	none: () => ({}),
}

/** A card's bottom line as `TaskCard` props — the same words on the desktop kanban and on the cloud panel. */
export function useCardMeta(meta: CardMeta): CardMetaProps {
	const { t } = useTranslation()
	const locale = useLocale()
	// TS cannot correlate `RENDER[meta.kind]` with `meta` across a union; `RENDER`'s own type keeps each entry honest.
	const render = RENDER[meta.kind] as (
		meta: CardMeta,
		t: ReturnType<typeof useTranslation>['t'],
		time: (iso: string) => string,
	) => CardMetaProps
	return render(meta, t, iso => formatTimeOfDay(iso, locale))
}
