import { describe, expect, it } from 'bun:test'
import { AskAnswerKind, AskEffect } from '@codm/contracts-typescript/wire/enums'
import { AskAnswerSchema, AskDefaultSchema, StopAnswerSchema, StopAskSchema } from './StopAsk'

describe('StopAsk wire shapes', () => {
	const ask = {
		question: 'Publish the new banner?',
		options: [
			{ id: 'yes', label: 'Yes' },
			{ id: 'no', label: 'No' },
		],
		effects: [AskEffect.PUBLISH],
	}

	it('a decision carries no default; a question carries one', () => {
		expect(StopAskSchema.parse(ask).default).toBeUndefined()
		const question = StopAskSchema.parse({ ...ask, effects: [], default: { kind: AskAnswerKind.OPTION, optionId: 'no' } })
		expect(question.default).toEqual({ kind: AskAnswerKind.OPTION, optionId: 'no' })
	})

	it('the default is a discriminated union, never two loose optionals', () => {
		expect(AskDefaultSchema.safeParse({ kind: AskAnswerKind.TEXT, text: 'keep the old one' }).success).toBe(true)
		expect(AskDefaultSchema.safeParse({ kind: AskAnswerKind.OPTION, text: 'keep the old one' }).success).toBe(false)
		expect(AskDefaultSchema.safeParse({ optionId: 'no', text: 'x' }).success).toBe(false)
	})

	it('caps the options an ask may offer', () => {
		const options = Array.from({ length: 7 }, (_, i) => ({ id: `o${i}`, label: `Option ${i}` }))
		expect(StopAskSchema.safeParse({ ...ask, options }).success).toBe(false)
	})

	it('a person answers with an option or text — never with DEFAULT', () => {
		expect(AskAnswerSchema.safeParse({ kind: AskAnswerKind.OPTION, optionId: 'yes' }).success).toBe(true)
		expect(AskAnswerSchema.safeParse({ kind: AskAnswerKind.TEXT, text: 'only on Monday' }).success).toBe(true)
		expect(AskAnswerSchema.safeParse({ kind: AskAnswerKind.TEXT, text: '   ' }).success).toBe(false)
		const applied = { kind: AskAnswerKind.DEFAULT, default: { kind: AskAnswerKind.OPTION, optionId: 'no' } }
		expect(AskAnswerSchema.safeParse(applied).success).toBe(false)
		expect(StopAnswerSchema.safeParse(applied).success).toBe(true)
	})
})
