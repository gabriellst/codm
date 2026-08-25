import { describe, it, expect } from 'bun:test'
import { interpolate, renderSnippet } from './render'
import type { Snippet } from './types'

describe('interpolate', () => {
	it('replaces every {{key}} with its binding value', () => {
		expect(interpolate('class {{Name}} extends {{base}} {}', { Name: 'Order', base: 'AggregateRoot' })).toBe(
			'class Order extends AggregateRoot {}',
		)
	})

	it('throws when a referenced placeholder has no binding', () => {
		expect(() => interpolate('hello {{missing}}', { Name: 'Order' })).toThrow(/missing/)
	})

	it('throws when the template still has an unresolved {{placeholder}} after interpolation', () => {
		// a binding value that itself contains a placeholder must not silently leak
		expect(() => interpolate('{{a}}', { a: 'literal {{leaked}}' })).toThrow(/leaked/)
	})
})

describe('renderSnippet', () => {
	const snippet: Snippet = {
		skeleton: 'default {{Name}}',
		skeletons: {
			primitive: 'primitive {{Name}} {{NAME_ERR}}',
		},
		fragments: {
			handle: 'handle({{destructuring}})',
			mock: 'mockController = true',
		},
	}

	it('uses the default skeleton when no _variant is given', () => {
		expect(renderSnippet(snippet, { Name: 'Email' })).toBe('default Email')
	})

	it('selects a named skeleton via _variant', () => {
		expect(renderSnippet(snippet, { _variant: 'primitive', Name: 'Email', NAME_ERR: 'INVALID_EMAIL' })).toBe(
			'primitive Email INVALID_EMAIL',
		)
	})

	it('throws when _variant names a skeleton that does not exist', () => {
		expect(() => renderSnippet(snippet, { _variant: 'nope', Name: 'Email' })).toThrow(/nope/)
	})

	it('resolves a fragment-ref binding (interpolating the fragment) before substituting', () => {
		const s: Snippet = { skeleton: 'body: {{classBody}}', fragments: { handle: 'handle({{destructuring}})' } }
		expect(renderSnippet(s, { classBody: { fragment: 'handle' }, destructuring: 'const { body } = request' })).toBe(
			'body: handle(const { body } = request)',
		)
	})

	it('throws when a fragment-ref names a fragment that does not exist', () => {
		const s: Snippet = { skeleton: '{{x}}', fragments: {} }
		expect(() => renderSnippet(s, { x: { fragment: 'ghost' } })).toThrow(/ghost/)
	})
})
