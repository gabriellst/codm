import { describe, it, expect } from 'bun:test'
import { pickCanonicalSnippet } from '../core/review-query'

describe('pickCanonicalSnippet', () => {
	it('prefers snippet.exemplar when present', () => {
		expect(pickCanonicalSnippet({ snippet: { skeleton: 's', exemplar: 'RICH' }, canonical_snippet: 'OLD' })).toBe('RICH')
	})
	it('falls back to legacy canonical_snippet when no snippet.exemplar', () => {
		expect(pickCanonicalSnippet({ canonical_snippet: 'OLD' })).toBe('OLD')
	})
	it('returns undefined when neither is present', () => {
		expect(pickCanonicalSnippet({ snippet: { skeleton: 's' } })).toBeUndefined()
	})
})
