import { describe, expect, it } from 'bun:test'
import { Linter } from 'eslint'
import tseslint from 'typescript-eslint'
import { buttonNeedsHandler, noHardcodedJsxText } from './component-quality'

const linter = new Linter()

/** Lint one TSX snippet with a single local rule; return how many times that rule fired. */
function count(ruleName: string, rule: unknown, code: string): number {
	const messages = linter.verify(
		code,
		[
			{
				files: ['**/*.tsx'],
				// biome-ignore lint/suspicious/noExplicitAny: flat-config shapes across eslint/tseslint versions
				languageOptions: { parser: tseslint.parser as any, parserOptions: { ecmaFeatures: { jsx: true } } },
				// biome-ignore lint/suspicious/noExplicitAny: rule module typing
				plugins: { local: { rules: { [ruleName]: rule as any } } },
				rules: { [`local/${ruleName}`]: 'error' },
			},
		],
		'test.tsx',
	)
	return messages.filter(m => m.ruleId === `local/${ruleName}`).length
}

describe('button-needs-handler', () => {
	it('allows a wired button (onClick / onPress / type=submit / asChild / spread / disabled)', () => {
		for (const code of [
			'const a = <Button onClick={fn}>Save</Button>',
			'const a = <Button onPress={fn}>Save</Button>',
			'const a = <Button type="submit">Save</Button>',
			'const a = <Button asChild><a href="/x">Go</a></Button>',
			'const a = <Button render={<Link to="/x" />}>Go</Button>', // Base UI render prop wires the action
			'const a = <Button {...props}>Save</Button>',
			'const a = <Button disabled>Loading</Button>',
			'const a = <Close render={<Button variant="ghost" />} />', // Base UI composition
		]) {
			expect(count('button-needs-handler', buttonNeedsHandler, code)).toBe(0)
		}
	})
	it('flags a dead (text-only) button', () => {
		expect(count('button-needs-handler', buttonNeedsHandler, 'const a = <Button variant="ghost">Save</Button>')).toBe(1)
		expect(count('button-needs-handler', buttonNeedsHandler, 'const a = <Button>Click me</Button>')).toBe(1)
	})
})

describe('no-hardcoded-jsx-text', () => {
	it('allows t() / expressions / symbols / i18n keys', () => {
		for (const code of [
			'const a = <div>{t("x.y")}</div>',
			'const a = <div>{count}</div>',
			'const a = <div>—</div>',
			'const a = <Input placeholder="form.field.placeholder" />', // dotted = i18n key
			'const a = <div className="p-4" />',
		]) {
			expect(count('no-hardcoded-jsx-text', noHardcodedJsxText, code)).toBe(0)
		}
	})
	it('flags hardcoded JSX text and user-facing attributes', () => {
		expect(count('no-hardcoded-jsx-text', noHardcodedJsxText, 'const a = <Button>Save</Button>')).toBe(1)
		expect(count('no-hardcoded-jsx-text', noHardcodedJsxText, 'const a = <Input placeholder="Buscar moeda" />')).toBe(1)
		expect(count('no-hardcoded-jsx-text', noHardcodedJsxText, 'const a = <button aria-label="Close dialog" />')).toBe(1)
	})
})
