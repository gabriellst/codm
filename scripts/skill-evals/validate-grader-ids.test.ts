/**
 * validate-grader-ids.test.ts — units for the grader-id uniqueness validator.
 *
 * Covers the core dup-detection function (findDuplicateIds) plus the prefix helpers:
 *   - a TRUE duplicate (same id + same spec twice) must be flagged with trueDup=true,
 *   - distinct specs under one id is a WARN-only reuse (trueDup=false),
 *   - a clean task yields zero dups.
 */

import { describe, expect, it } from 'bun:test'
import { findDuplicateIds, idPrefix, isKnownPrefix } from './validate-grader-ids'
import type { GraderSpec } from './types'

const g = (kind: GraderSpec['kind'], spec: string, id?: string): GraderSpec => ({ kind, spec, ...(id ? { id } : {}) })

// ─── findDuplicateIds ───────────────────────────────────────────────

describe('findDuplicateIds', () => {
	it('flags a TRUE duplicate: same id attached to the SAME spec twice', () => {
		const dups = findDuplicateIds({
			graders: [
				g('grep-must', 'a/**::PurchaseOrder', 'controller#derive-omit'),
				g('grep-must', 'a/**::PurchaseOrder', 'controller#derive-omit'), // ← copy-paste slip
				g('tsc', 'app-react', 'react#tsc'),
			],
		})
		expect(dups).toHaveLength(1)
		const dup = dups[0]!
		expect(dup.id).toBe('controller#derive-omit')
		expect(dup.count).toBe(2)
		expect(dup.trueDup).toBe(true)
		// distinct specs collapse to one when the spec is identical
		expect(dup.specs).toEqual(['a/**::PurchaseOrder'])
	})

	it('treats one id over DIFFERENT specs as a WARN-only reuse (trueDup=false)', () => {
		// Mirrors the real onboarding task: form#FRM-P44 graded by several distinct greps.
		const dups = findDuplicateIds({
			graders: [
				g('grep-must', 'r/**::pickUnionVariantField\\(', 'form#FRM-P44'),
				g('grep-must', 'r/**::unionVariantValues\\(', 'form#FRM-P44'),
				g('grep-must-not', 'r/**::\\.def\\.options\\[', 'form#FRM-P44'),
			],
		})
		expect(dups).toHaveLength(1)
		const dup = dups[0]!
		expect(dup.id).toBe('form#FRM-P44')
		expect(dup.count).toBe(3)
		expect(dup.trueDup).toBe(false)
		expect(dup.specs).toHaveLength(3)
	})

	it('returns no dups for a clean task (every id unique)', () => {
		const dups = findDuplicateIds({
			graders: [
				g('tsc', 'backend', 'ts#tsc'),
				g('grep-must', 'x/**::withTransaction\\(', 'usecase#transaction'),
				g('file-exists', 'x/y.ts', 'ts#aggregate'),
			],
		})
		expect(dups).toEqual([])
	})

	it('uses the kind:spec fallback label when no explicit id is set', () => {
		// Two graders, no id, identical kind+spec → identical fallback label → true dup.
		const dups = findDuplicateIds({
			graders: [g('grep-must', 'a/**::Foo'), g('grep-must', 'a/**::Foo')],
		})
		expect(dups).toHaveLength(1)
		expect(dups[0]!.id).toBe('grep-must:a/**::Foo')
		expect(dups[0]!.trueDup).toBe(true)
	})

	it('sorts true dups ahead of warn-only reuse', () => {
		const dups = findDuplicateIds({
			graders: [
				// warn-only reuse
				g('grep-must', 'a::X', 'form#FRM-P01'),
				g('grep-must', 'b::Y', 'form#FRM-P01'),
				// true dup
				g('grep-must', 'c::Z', 'errors#vocab'),
				g('grep-must', 'c::Z', 'errors#vocab'),
			],
		})
		expect(dups.map(d => d.trueDup)).toEqual([true, false])
		expect(dups[0]!.id).toBe('errors#vocab')
	})
})

// ─── prefix helpers ─────────────────────────────────────────────────

describe('idPrefix / isKnownPrefix', () => {
	it('extracts the prefix before the first # (null when absent)', () => {
		expect(idPrefix('controller#derive-omit')).toBe('controller')
		expect(idPrefix('atlas#DISC-UNION')).toBe('atlas')
		expect(idPrefix('grep-must:a/**::b')).toBeNull()
	})

	it('accepts real skill dirs and the sanctioned author prefixes, warns on the rest', () => {
		const skills = new Set(['controller', 'form', 'entity'])
		expect(isKnownPrefix('controller', skills)).toBe(true)
		expect(isKnownPrefix('atlas', skills)).toBe(true)
		expect(isKnownPrefix('universal', skills)).toBe(true)
		expect(isKnownPrefix('detect', skills)).toBe(true)
		expect(isKnownPrefix('statcard', skills)).toBe(false)
	})
})
