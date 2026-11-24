import type { ReactNode } from 'react'
import {
	askAnswerSchema,
	AskAnswerKindEnum,
	IssueLifeStateEnum,
	PanelActionKindEnum,
	useGetPanelIdentity,
	type GetPanelIssueQueryResponse,
} from '@codm/client-typescript/typescript-cloud'
import { TaskSurfaceProvider, type TaskSurface } from '@/components/task/TaskSurface'
import { pickUnionVariantField } from '@/lib/union'
import { usePanelToken } from './panelToken'
import { usePanelAction, usePanelActionPending } from './usePanelAction'

/** The free-text answer, validated by the cloud SDK's own TEXT member of the `ANSWER_ASK` answer (NN2). */
export const panelAnswerTextSchema = pickUnionVariantField(askAnswerSchema, { kind: AskAnswerKindEnum.TEXT }, 'text')

type PanelIssue = GetPanelIssueQueryResponse['issue']

/**
 * The CLOUD side of the task conversation's port (`TaskSurface`): a person who identified on this device answers
 * and resolves through `POST /actions` (the daemon carries it out on its next sync). Whoever has not identified —
 * and anyone on a finished task — sees the cards locked. The panel knows no names (spec cut: the synced timeline
 * carries no identity), opens no artifact (no gallery in the cloud yet) and its event lines are words only.
 */
export function PanelTaskSurface({ issue, children }: { issue: PanelIssue; children: ReactNode }) {
	const token = usePanelToken()
	const { data: me } = useGetPanelIdentity(token)
	const act = usePanelAction()
	const pending = usePanelActionPending()
	const member = me?.member

	const surface: TaskSurface = {
		answerAsk: (stopId, answer) => act({ kind: PanelActionKindEnum.ANSWER_ASK, issueId: issue.issueId, stopId, answer }),
		resolveStop: (stopId, resolution) => act({ kind: PanelActionKindEnum.ANSWER_STOP, issueId: issue.issueId, stopId, resolution }),
		pending,
		canRelease: member?.canRelease ?? false,
		canAct: member !== undefined && issue.lifeState !== IssueLifeStateEnum.DONE,
		answerTextSchema: panelAnswerTextSchema,
		events: {},
	}
	return <TaskSurfaceProvider value={surface}>{children}</TaskSurfaceProvider>
}
