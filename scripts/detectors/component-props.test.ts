import { describe, expect, test } from 'bun:test'
import { classNameReachesRoot, componentBlocks, declaresClassName, rootAcceptsClassName, rootOpeningTag } from './component-props'

/**
 * Self-test for CP-04 — `className` é universal (component bp-29).
 *
 * A regra nasceu vermelha em 8 componentes e foi para verde no mesmo passe; sem este arquivo o
 * "vermelho" seria só uma anedota do dia. Cada predicado tem o caso que DEVE reprovar ao lado do que
 * deve passar, porque um gate que não sabe reprovar é um gate que mede zero.
 */

const FILE = '/repo/packages/app/react/src/components/X/index.tsx'

function block(source: string) {
	const [b] = componentBlocks(source)
	return b
}

describe('rootOpeningTag', () => {
	test('lê a tag inteira mesmo com `>` dentro de uma expressão de prop', () => {
		const tag = rootOpeningTag(`export function X() {\n\treturn (\n\t\t<div onClick={() => go()} className="a">\n\t\t\t<span />\n`)
		expect(tag).toBe('<div onClick={() => go()} className="a">')
	})

	test('null quando o componente não retorna JSX', () => {
		expect(rootOpeningTag('export function X() {\n\treturn null\n}')).toBeNull()
	})
})

describe('declaresClassName', () => {
	const withParam = `export function X({ item, className }: { item: T } & Pick<ComponentProps<typeof Card>, 'className'>) {\n\treturn <Card className={cn('p', className)}>{item}</Card>\n}`
	const withoutParam = `export function X({ item }: { item: T }) {\n\treturn <Card className="p">{item}</Card>\n}`

	test('destructuring de className conta como superfície', () => {
		expect(declaresClassName(block(withParam), withParam)).toBe(true)
	})

	test('sem className declarado, não conta', () => {
		expect(declaresClassName(block(withoutParam), withoutParam)).toBe(false)
	})

	test('um bag tipado por ComponentProps também conta', () => {
		const src = `export function X(props: ComponentProps<'div'>) {\n\treturn <div {...props} />\n}`
		expect(declaresClassName(block(src), src)).toBe(true)
	})
})

describe('classNameReachesRoot', () => {
	test('cn() com o className do chamador mescla', () => {
		expect(classNameReachesRoot(`<Card className={cn('mb-4', className)}>`)).toBe(true)
	})

	test('encaminhar direto mescla quando a raiz não tem classe própria', () => {
		expect(classNameReachesRoot('<DialogContent className={className}>')).toBe(true)
	})

	test('spread sozinho mescla — o bag carrega className', () => {
		expect(classNameReachesRoot('<div data-slot="x" {...props} />')).toBe(true)
	})

	test('literal AO LADO de spread é clobber, não merge', () => {
		expect(classNameReachesRoot('<Sonner className="toaster group" {...props} />')).toBe(false)
	})

	test('literal sozinho não deixa nada chegar', () => {
		expect(classNameReachesRoot('<Card className="mb-4 border-warning/50">')).toBe(false)
	})
})

describe('rootAcceptsClassName — isenção (b), estrutural e não por whitelist', () => {
	test('tag DOM sempre aceita', () => {
		expect(rootAcceptsClassName('div', '', FILE)).toBe(true)
	})

	test('context Provider não renderiza elemento — isento', () => {
		expect(rootAcceptsClassName('DataTableContext.Provider', '', FILE)).toBe(false)
	})

	test('wrapper local que só espalha um `*.Root.Props` headless — isento', () => {
		const src = [
			`function Popover({ ...props }: PopoverPrimitive.Root.Props) {`,
			`\treturn <PopoverPrimitive.Root data-slot="popover" {...props} />`,
			`}`,
			`export function X() {`,
			`\treturn <Popover>{null}</Popover>`,
			`}`,
		].join('\n')
		expect(rootAcceptsClassName('Popover', src, FILE)).toBe(false)
	})

	test('wrapper local que nomeia className — exigido', () => {
		const src = [
			`function Card({ className, ...props }: React.ComponentProps<'div'>) {`,
			`\treturn <div className={cn('card', className)} {...props} />`,
			`}`,
			`export function X() {`,
			`\treturn <Card>{null}</Card>`,
			`}`,
		].join('\n')
		expect(rootAcceptsClassName('Card', src, FILE)).toBe(true)
	})

	test('raiz de node_modules (não resolvível) — exigido por padrão', () => {
		const src = `import { Link } from '@tanstack/react-router'\nexport function X() {\n\treturn <Link to="/">go</Link>\n}`
		expect(rootAcceptsClassName('Link', src, FILE)).toBe(true)
	})
})
