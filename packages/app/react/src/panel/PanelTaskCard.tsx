import type { ComponentProps, MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { GetPanelBoardQueryResponse } from '@codm/client-typescript/typescript-cloud'
import { StatusPill } from '@codm/app-ui/status-pill'
import { TaskCard } from '@codm/app-ui/task-card'
import { useCardMeta } from '@/components/task/useCardMeta'
import { enumLabel } from '@/lib/enums'
import { cardMetaOf } from '@/lib/task/cardMeta'
import { TASK_COLUMN_OF } from '@/lib/task/issueBoard'
import { openHash } from './panelHash'

type BoardIssue = GetPanelBoardQueryResponse['issues'][number]

/** A plain click opens in place (the address is replaced, not pushed); a modified click keeps the browser's. */
function openInPlace(key: string) {
	return (event: MouseEvent<HTMLAnchorElement>) => {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
		event.preventDefault()
		openHash(key)
	}
}

/**
 * One task on the panel — a link to `#KEY` (shareable as is), its bottom line chosen by its column, the same
 * words the desktop kanban shows. `withStatus` adds the column's pill (the list beside an open task, where no
 * column says it).
 */
export function PanelTaskCard({
	issue,
	withStatus = false,
	...props
}: Omit<ComponentProps<typeof TaskCard>, 'taskKey' | 'title'> & { issue: BoardIssue; withStatus?: boolean }) {
	const { t } = useTranslation()
	// "Pausada" on the board comes from the live state itself: the board carries no `paused` flag (review M5).
	const metaProps = useCardMeta(cardMetaOf(issue))
	const column = TASK_COLUMN_OF[issue.lifeState]
	return (
		<TaskCard
			data-testid="panel-task-card"
			size="compact"
			taskKey={issue.key}
			title={issue.title}
			status={
				withStatus ? (
					<StatusPill tone={column} title={enumLabel('IssueLifeState', issue.lifeState)}>
						{t(`task.columns.${column}`)}
					</StatusPill>
				) : undefined
			}
			render={<a href={`#${encodeURIComponent(issue.key)}`} onClick={openInPlace(issue.key)} />}
			{...metaProps}
			{...props}
		/>
	)
}
