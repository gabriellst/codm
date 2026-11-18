import type { Meta, StoryObj } from '@storybook/react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { AskAnswerKindEnum, StopKindEnum } from '@codm/client-typescript/typescript'
import { StopAskCard } from '.'

/**
 * Fase 3 — an issue's open ask, one renderer per variant (Non-Negotiable 3): a decision with option buttons,
 * a question answered in free text. `StopAskCard` owns its `useAnswerStop`; the global decorator provides the
 * QueryClient, and the click story intercepts the POST to prove the body is the SDK's OPTION member.
 */

const THREAD = '019e4d24-6524-7041-9e1c-8108180cdd20'
const STOP = '019e4d24-6524-7041-9e1c-8108180cdd21'
const ISSUE = '019e4d24-6524-7041-9e1c-8108180cdd22'

const meta = {
	title: 'Console/StopAskCard',
	component: StopAskCard,
	args: { stopId: STOP, threadId: THREAD, issueId: ISSUE },
} satisfies Meta<typeof StopAskCard>
export default meta

type Story = StoryObj<typeof meta>

let answered: unknown
/** A decision with a declared effect: one button per option, and the note that only a releaser answers it. */
export const DecisionWithOptions: Story = {
	args: {
		ask: {
			kind: StopKindEnum.DECISION_REQUESTED,
			code: 'APP-12 · D1',
			question: 'Publico a prévia no site?',
			reply: {
				kind: AskAnswerKindEnum.OPTION,
				options: [
					{ id: 'yes', label: 'Sim' },
					{ id: 'no', label: 'Não' },
				],
			},
			releaseRequired: true,
		},
	},
	parameters: {
		msw: {
			handlers: [
				http.post(`*/stops/${STOP}/answer`, async ({ request }) => {
					answered = await request.json()
					return new HttpResponse(null, { status: 204 })
				}),
			],
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(canvasElement).toHaveTextContent('APP-12 · D1')
		await expect(canvas.queryByRole('textbox')).toBeNull()
		await userEvent.click(canvas.getByRole('button', { name: 'Não' }))
		await waitFor(() => expect(answered).toEqual({ kind: 'OPTION', optionId: 'no' }))
	},
}

/** A question with no options is answered in the person's own words, and names what it goes on with. */
export const QuestionInFreeText: Story = {
	args: {
		ask: {
			kind: StopKindEnum.QUESTION_ASKED,
			code: 'APP-15 · D2',
			question: 'Qual título uso no post?',
			reply: { kind: AskAnswerKindEnum.TEXT },
			defaultLabel: 'Novidades de novembro',
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(canvas.getByRole('textbox')).toBeInTheDocument()
		await expect(canvasElement).toHaveTextContent('Novidades de novembro')
		// The send button stays off until the text satisfies the SDK's TEXT member (non-empty).
		await expect(canvas.getByRole('button')).toBeDisabled()
	},
}
