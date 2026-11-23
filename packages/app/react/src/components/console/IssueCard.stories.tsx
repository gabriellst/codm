import type { Meta, StoryObj } from '@storybook/react'
import { expect } from 'storybook/test'
import { IssueLifeStateEnum, IssueStatusEnum } from '@codm/client-typescript/typescript'
import i18n from '@/lib/i18n'
import { formatDayAndTime, formatTimeOfDay } from '@/lib/format'
import { DEFAULT_LOCALE } from '@/lib/locale'
import { connected } from '@/storybook'
import { IssueCard, type IssueCardItem } from './IssueCard'

/**
 * One card on the board — fase 5 (S6): a failed turn waiting for its next attempt shows WHEN (the time alone today,
 * with the day once it crosses midnight), and a task the supervisor escalated carries the badge. The card is a leaf
 * (the item comes by prop); `connected` only provides the router its `Link` needs.
 *
 * The words are read through `i18n.t`; the instants are formatted in the default locale, the one the runner (`IssueCard.test.tsx`) sets.
 */
const today = new Date()
today.setHours(23, 59, 0, 0)
const tomorrow = new Date(today)
tomorrow.setDate(today.getDate() + 1)
tomorrow.setHours(0, 40, 0, 0)

const item = (overrides: Partial<IssueCardItem> = {}): IssueCardItem => ({
	issueId: '019e4d24-6524-7041-9e1c-8108180cdd90',
	threadId: '019e4d24-6524-7041-9e1c-8108180cddae',
	key: 'APP-21',
	title: 'Gerar a fatura do mês',
	status: IssueStatusEnum.WORKING,
	lifeState: IssueLifeStateEnum.RUNNING,
	archived: false,
	threadDisplayName: 'DEMO SHOP BOT',
	...overrides,
})

const meta = {
	title: 'Console/IssueCard',
	component: IssueCard,
	parameters: connected({ route: { id: '/(app)/issues/', search: { archived: false } } }),
} satisfies Meta<typeof IssueCard>
export default meta

type Story = StoryObj<typeof meta>

/** Today: the time alone — and not the life state's own label, which the time badge replaces. */
export const RetryingToday: Story = {
	args: { item: item({ lifeState: IssueLifeStateEnum.WAITING_RETRY, retryingAt: today.toISOString() }) },
	play: async ({ canvasElement }) => {
		const locale = DEFAULT_LOCALE
		const when = formatTimeOfDay(today.toISOString(), locale)
		await expect(canvasElement).toHaveTextContent(i18n.t('session.retryingAt', { when }))
		await expect(canvasElement).not.toHaveTextContent(formatDayAndTime(today.toISOString(), locale))
		await expect(canvasElement).not.toHaveTextContent(i18n.t('enums.IssueLifeState.WAITING_RETRY'))
	},
}

/** Past midnight: day and time, or "00:40" reads as today. */
export const RetryingTomorrow: Story = {
	args: { item: item({ lifeState: IssueLifeStateEnum.WAITING_RETRY, retryingAt: tomorrow.toISOString() }) },
	play: async ({ canvasElement }) => {
		const locale = DEFAULT_LOCALE
		const when = formatDayAndTime(tomorrow.toISOString(), locale)
		await expect(canvasElement).toHaveTextContent(i18n.t('session.retryingAt', { when }))
	},
}

/** Escalated by the supervisor: the badge — the whole escalation, nobody is messaged. */
export const Escalated: Story = {
	args: { item: item({ lifeState: IssueLifeStateEnum.STALLED, escalatedAt: today.toISOString() }) },
	play: async ({ canvasElement }) => {
		await expect(canvasElement).toHaveTextContent(i18n.t('session.escalatedBySupervisor'))
	},
}

/** Neither: no retry line, no badge. */
export const Plain: Story = {
	args: { item: item() },
	play: async ({ canvasElement }) => {
		await expect(canvasElement).toHaveTextContent('APP-21')
		await expect(canvasElement).not.toHaveTextContent(i18n.t('session.escalatedBySupervisor'))
		await expect(canvasElement).not.toHaveTextContent(i18n.t('session.retryingAt', { when: '' }).trim())
	},
}
