import { describe, expect, it } from 'bun:test'
import { StopKind, StopResolution } from '@codm/contracts-typescript/wire/enums'
import {
	GIVEN_BY_NAME_ALONE,
	bareResolutionsForKind,
	OFFERED_ON_PANEL,
	RESOLUTIONS_BY_KIND,
	RESUMES_WITH_RESOLVER_POSTURE,
	isResolutionApplicable,
	panelResolutionsForKind,
} from './StopResolutions'

describe('StopResolutions — fase 3 asks and the stall', () => {
	it('every kind admits TAKE_OVER', () => {
		for (const kind of Object.values(StopKind)) expect(RESOLUTIONS_BY_KIND[kind]).toContain(StopResolution.TAKE_OVER)
	})

	it('a decision is answered, never approved or defaulted', () => {
		expect(RESOLUTIONS_BY_KIND[StopKind.DECISION_REQUESTED]).toEqual([StopResolution.ANSWER, StopResolution.TAKE_OVER])
		expect(isResolutionApplicable(StopKind.DECISION_REQUESTED, StopResolution.DEFAULT_APPLIED)).toBe(false)
		expect(isResolutionApplicable(StopKind.DECISION_REQUESTED, StopResolution.APPROVE)).toBe(false)
	})

	it('a question is answered or goes on with its default', () => {
		expect(RESOLUTIONS_BY_KIND[StopKind.QUESTION_ASKED]).toEqual([
			StopResolution.ANSWER,
			StopResolution.DEFAULT_APPLIED,
			StopResolution.TAKE_OVER,
		])
	})

	it('the stall is retried or taken over — it asks nothing to answer', () => {
		expect(RESOLUTIONS_BY_KIND[StopKind.STALLED]).toEqual([StopResolution.RETRY, StopResolution.TAKE_OVER])
	})

	it('ANSWER/DEFAULT_APPLIED belong to the asks only — the old kinds keep their vocabulary', () => {
		const asks: StopKind[] = [StopKind.DECISION_REQUESTED, StopKind.QUESTION_ASKED]
		for (const kind of Object.values(StopKind).filter(k => !asks.includes(k))) {
			expect(isResolutionApplicable(kind, StopResolution.ANSWER)).toBe(false)
			expect(isResolutionApplicable(kind, StopResolution.DEFAULT_APPLIED)).toBe(false)
		}
	})

	it('an answer resumes with the answerer’s posture; a default that applied never elevates', () => {
		expect(RESUMES_WITH_RESOLVER_POSTURE[StopResolution.ANSWER]).toBe(true)
		expect(RESUMES_WITH_RESOLVER_POSTURE[StopResolution.DEFAULT_APPLIED]).toBe(false)
	})

	it('the panel never offers ANSWER on the bare-resolution door (ANSWER_STOP) — asks are answered by ANSWER_ASK', () => {
		expect(OFFERED_ON_PANEL[StopResolution.ANSWER]).toBe(false)
		expect(OFFERED_ON_PANEL[StopResolution.DEFAULT_APPLIED]).toBe(false)
		expect(panelResolutionsForKind(StopKind.DECISION_REQUESTED)).toEqual([])
		expect(panelResolutionsForKind(StopKind.STALLED)).toEqual([StopResolution.RETRY])
	})

	it('the Needs-you card never offers a bare ANSWER or the job-only DEFAULT_APPLIED', () => {
		expect(GIVEN_BY_NAME_ALONE[StopResolution.ANSWER]).toBe(false)
		expect(GIVEN_BY_NAME_ALONE[StopResolution.DEFAULT_APPLIED]).toBe(false)
		expect(bareResolutionsForKind(StopKind.DECISION_REQUESTED)).toEqual([StopResolution.TAKE_OVER])
		expect(bareResolutionsForKind(StopKind.QUESTION_ASKED)).toEqual([StopResolution.TAKE_OVER])
		// The old kinds keep every button they had.
		expect(bareResolutionsForKind(StopKind.APPROVAL_NEEDED)).toEqual(RESOLUTIONS_BY_KIND[StopKind.APPROVAL_NEEDED])
	})
})
