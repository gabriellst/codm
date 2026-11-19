import { describe, expect, it } from 'bun:test'
import { AskAnswerKind, AskEffect, StopResolution } from '@codm/contracts-typescript/wire/enums'
import type { StopAsk } from '@shared/objects'
import { PUBLISH_AUTHORIZED_BY } from './PublishAuthorizedBy'

const publishAsk: StopAsk = {
	question: 'Publico?',
	options: [
		{ id: 'go', label: 'Pode publicar', authorizes: [AskEffect.PUBLISH] },
		{ id: 'wait', label: 'Ainda não' },
	],
	effects: [AskEffect.PUBLISH],
}
const go = { kind: AskAnswerKind.OPTION, optionId: 'go' } as const
const wait = { kind: AskAnswerKind.OPTION, optionId: 'wait' } as const

/**
 * WHETHER A RESOLUTION AUTHORIZES PUBLISHING (fase 4, item 6c) — by declared data only: the ask says PUBLISH is at
 * stake and the chosen option (or the default the deadline applied) says it authorizes it, or an APPROVE of an ask
 * declaring PUBLISH. Never APPROVE in general, never an option that declares nothing.
 */
describe('PUBLISH_AUTHORIZED_BY — publishing is authorized by declared data only', () => {
	it('an answer choosing the option that authorizes PUBLISH, on an ask declaring PUBLISH, authorizes', () => {
		expect(PUBLISH_AUTHORIZED_BY[StopResolution.ANSWER]({ ask: publishAsk, answer: go })).toBe(true)
	})

	it('the default the deadline applied authorizes when it names the authorizing option', () => {
		expect(
			PUBLISH_AUTHORIZED_BY[StopResolution.DEFAULT_APPLIED]({ ask: publishAsk, answer: { kind: AskAnswerKind.DEFAULT, default: go } }),
		).toBe(true)
	})

	it('another option, a text answer, or an option on an ask that does not declare PUBLISH authorize nothing', () => {
		expect(PUBLISH_AUTHORIZED_BY[StopResolution.ANSWER]({ ask: publishAsk, answer: wait })).toBe(false)
		expect(PUBLISH_AUTHORIZED_BY[StopResolution.ANSWER]({ ask: publishAsk, answer: { kind: AskAnswerKind.TEXT, text: 'sim' } })).toBe(false)
		expect(PUBLISH_AUTHORIZED_BY[StopResolution.ANSWER]({ ask: { ...publishAsk, effects: [] }, answer: go })).toBe(false)
	})

	it('an APPROVE authorizes only when the ask declares PUBLISH — never an approval in general', () => {
		expect(PUBLISH_AUTHORIZED_BY[StopResolution.APPROVE]({ ask: publishAsk })).toBe(true)
		expect(PUBLISH_AUTHORIZED_BY[StopResolution.APPROVE]({})).toBe(false)
		expect(PUBLISH_AUTHORIZED_BY[StopResolution.APPROVE]({ ask: { ...publishAsk, effects: [AskEffect.IRREVERSIBLE] } })).toBe(false)
	})

	it('a denial, a retry, a take-over never authorize', () => {
		for (const resolution of [StopResolution.DENY, StopResolution.RETRY, StopResolution.REVIEW_AND_SEND, StopResolution.TAKE_OVER]) {
			expect(PUBLISH_AUTHORIZED_BY[resolution]({ ask: publishAsk, answer: go })).toBe(false)
		}
	})
})
