import { describe, expect, it } from 'bun:test'
import { issuePrefixOf } from './IssuePrefix'

describe('issuePrefixOf — the short-key prefix derived from the workspace folder', () => {
	it('one word → its first three letters', () => {
		expect(issuePrefixOf('/home/dev/Projects/codm')).toBe('COD')
	})

	it('several words → initials of all but the last, plus the first two of the last', () => {
		expect(issuePrefixOf('/home/dev/web-app')).toBe('WAP')
		expect(issuePrefixOf('/home/dev/acme_store')).toBe('AST')
	})

	it('uses the LAST path segment, ignores a trailing slash, and works on Windows paths', () => {
		expect(issuePrefixOf('/home/dev/web-app/')).toBe('WAP')
		expect(issuePrefixOf('C:\\Users\\dev\\web-app')).toBe('WAP')
	})

	it('never returns empty', () => {
		expect(issuePrefixOf('/')).toBe('ISS')
		expect(issuePrefixOf('/home/dev/---')).toBe('ISS')
	})
})
