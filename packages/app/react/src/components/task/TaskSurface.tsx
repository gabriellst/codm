import { createContext, useContext, type ReactNode } from 'react'
import type { AnswerStopMutationRequest, GetNeedsYouPanelQueryResponse, StopResolution } from '@codm/client-typescript/typescript'
import type { EventDetailCapabilities } from './TaskEventDetail'
import type { answerTextSchema } from './useAnswerAsk'

/** An open ask as a surface shows it — code, question, how to answer, who may answer. The desktop reads it
 *  from the needs-you panel, the cloud panel from the issue's open stops: the same `AskView`, generated
 *  once per SDK surface (the panel's must stay assignable to this one). */
export type AskView = NonNullable<GetNeedsYouPanelQueryResponse['stops'][number]['ask']>

/** What answering an ask sends: one of its options, or the person's own words — the SDK's body union. */
export type AskAnswer = AnswerStopMutationRequest

/** Who wrote a message in the conversation, when the surface knows (the desktop does; the panel does not). */
export interface MessageSender {
	name: string
	initials: string
}

/**
 * The task conversation's PORT: everything that differs between the desktop and the cloud panel, behind one
 * context — so the shared components own no host-specific hook and receive no callback by prop (CMP-P10).
 * The desktop provides the daemon's mutations; the panel provides `POST /actions` on behalf of the person
 * who identified on that device.
 */
export interface TaskSurface {
	/** Answer an open ask (decision or question). */
	answerAsk: (stopId: string, answer: AskAnswer) => void
	/** Resolve an open stop that has no ask (retry, take over, approve…). */
	resolveStop: (stopId: string, resolution: StopResolution) => void
	/** True while an answer/resolution is on its way — the cards disable their buttons. */
	pending: boolean
	/** Whether the person on this surface may answer a decision that needs a releaser. */
	canRelease: boolean
	/** Whether this surface may act at all (the panel: someone identified and the task not done). */
	canAct: boolean
	/** The free-text answer's validator — the SDK schema of the request this surface sends (Non-Negotiable 2);
	 *  a surface's own schema must keep this shape (the daemon's TEXT member is the reference). */
	answerTextSchema: typeof answerTextSchema
	/** Who wrote a message, by transcript entry id — absent where the surface does not know. */
	senderOf?: (entryId: string) => MessageSender | undefined
	/** Opens an artifact (the desktop's preview dialog) — absent where there is nothing to open. */
	openArtifact?: (artifactId: string) => void
	/** What the event lines may offer beyond words (publish output, batch link). */
	events: EventDetailCapabilities
}

const TaskSurfaceContext = createContext<TaskSurface | null>(null)

export function TaskSurfaceProvider({ value, children }: { value: TaskSurface; children: ReactNode }) {
	return <TaskSurfaceContext.Provider value={value}>{children}</TaskSurfaceContext.Provider>
}

export function useTaskSurface(): TaskSurface {
	const surface = useContext(TaskSurfaceContext)
	if (!surface) throw new Error('useTaskSurface: no TaskSurfaceProvider above this component')
	return surface
}
