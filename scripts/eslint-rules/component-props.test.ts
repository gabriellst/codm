import { afterAll, describe, expect, it } from 'bun:test'
import { RuleTester } from 'eslint'
import tseslint from 'typescript-eslint'
import { componentProps, isRouteModule } from './component-props'

/**
 * Self-test for `local/component-props` — the className doctrine (component bp-20 / bp-29).
 *
 * TYPE-AWARE, so the cases run against a real tsconfig in `__fixtures__/` with `@types/react`
 * resolved from the workspace root. Without types the two structural exemptions (a context Provider,
 * a headless Base UI root) could only be a whitelist; with them they are the SAME question the
 * checker already answers — "does this root's props type have a className?".
 *
 * Every predicate has the case that must FAIL next to the one that must pass, because a gate that
 * cannot fail measures nothing. The `valid` block also carries the shapes the walker this rule
 * replaces was BLIND to — barrel export, arrow, memo, forwardRef, export default — since being able
 * to see them at all is the reason the migration happened.
 */

const FIXTURE = new URL('./__fixtures__/', import.meta.url).pathname
const APP = `${FIXTURE}src/components/file.tsx`
const ROUTE = `${FIXTURE}src/routes/index.tsx`
const ROUTE_COMPONENT = `${FIXTURE}src/routes/-components/file.tsx`

// bun:test exposes its hooks as imports, not globals; RuleTester reads them off its own statics.
/* biome-ignore lint/suspicious/noExplicitAny: RuleTester's test-framework hooks are untyped statics */
const hooks = RuleTester as any
hooks.describe = describe
hooks.it = it
hooks.afterAll = afterAll

const ruleTester = new RuleTester({
	languageOptions: {
		/* biome-ignore lint/suspicious/noExplicitAny: parser shape differs across eslint/tseslint versions */
		parser: tseslint.parser as any,
		parserOptions: { project: './tsconfig.json', tsconfigRootDir: FIXTURE },
	},
})

const REACT = "import type { ComponentProps, ReactNode } from 'react'\nimport * as React from 'react'\n"
/** A design-system wrapper that DOES take className — the `<Card>` case. */
const CARD = `function Card({ className, ...props }: ComponentProps<'div'>) { return <div className={className} {...props} /> }\n`
/** A headless root: Base UI's `Popover.Root` "doesn't render its own HTML element" — no className. */
const HEADLESS = `type RootProps = { children?: ReactNode }\nfunction Root(props: RootProps): ReactNode { return props.children }\n`
const cn = 'const cn = (...parts: unknown[]) => parts.join(" ")\n'

describe('isRouteModule — exemption (a), the router instantiates it', () => {
	it('a route module has no caller to pass a prop', () => {
		expect(isRouteModule('/repo/packages/app/react/src/routes/index.tsx')).toBe(true)
		expect(isRouteModule('/repo/packages/app/react/src/routes/(app)/threads/$threadId/route.tsx')).toBe(true)
		expect(isRouteModule('/repo/packages/app/react/src/routes/__root.tsx')).toBe(true)
	})
	it('a `-`-prefixed segment is what the router EXCLUDES — those have ordinary callers', () => {
		expect(isRouteModule('/repo/packages/app/react/src/routes/(app)/dashboard/-components/Card.tsx')).toBe(false)
		expect(isRouteModule('/repo/packages/app/react/src/routes/x/-hooks/useThing.tsx')).toBe(false)
	})
	it('nothing outside routes/ is a route module', () => {
		expect(isRouteModule('/repo/packages/app/react/src/components/ui/card.tsx')).toBe(false)
	})
})

/* biome-ignore lint/suspicious/noExplicitAny: createRule's inferred type vs RuleTester's RuleModule */
ruleTester.run('component-props', componentProps as any, {
	valid: [
		// ── the canon ─────────────────────────────────────────────────────────────────────────────
		{
			name: 'DOM root: typed from the root, merged with cn(), spread',
			filename: APP,
			code: `${REACT}${cn}export function Panel({ className, ...props }: ComponentProps<'div'>) { return <div className={cn('p-4', className)} {...props} /> }`,
		},
		{
			name: 'uppercase root: className merged onto the wrapper it renders',
			filename: APP,
			code: `${REACT}${cn}${CARD}export function ThreadCard({ className, ...props }: ComponentProps<typeof Card>) { return <Card className={cn('mb-4', className)} {...props} /> }`,
		},
		{
			name: 'a bag that is never destructured carries className through the spread',
			filename: APP,
			code: `${REACT}export function Panel(props: ComponentProps<'div'>) { return <div data-slot="panel" {...props} /> }`,
		},
		{
			name: 'className may land BELOW the root — a scroll container / Portal renders the real host deeper',
			filename: APP,
			code: `${REACT}${cn}export function Table({ className, ...props }: ComponentProps<'table'>) { return <div className="overflow-x-auto"><table className={cn('w-full', className)} {...props} /></div> }`,
		},
		{
			name: 'renaming the destructured binding still counts as landing it',
			filename: APP,
			code: `${REACT}${cn}export function Panel({ className: extra, ...props }: ComponentProps<'div'>) { return <div className={cn('p-4', extra)} {...props} /> }`,
		},

		// ── export shapes the `^export function X` walker was blind to ─────────────────────────────
		{
			name: 'barrel export at the bottom — 34 of the 40 files in components/ui/ look like this',
			filename: APP,
			code: `${REACT}${cn}function Badge({ className, ...props }: ComponentProps<'span'>) { return <span className={cn('badge', className)} {...props} /> }\nexport { Badge }`,
		},
		{
			name: 'arrow function assigned to a const',
			filename: APP,
			code: `${REACT}${cn}export const Pill = ({ className, ...props }: ComponentProps<'span'>) => <span className={cn('pill', className)} {...props} />`,
		},
		{
			name: 'memo(forwardRef(...)) wrapper',
			filename: APP,
			code: `${REACT}${cn}export const Row = React.memo(React.forwardRef<HTMLDivElement, ComponentProps<'div'>>(function Row({ className, ...props }, ref) { return <div ref={ref} className={cn('row', className)} {...props} /> }))`,
		},
		{
			name: 'export default',
			filename: APP,
			code: `${REACT}${cn}export default function Panel({ className, ...props }: ComponentProps<'div'>) { return <div className={cn('p-4', className)} {...props} /> }`,
		},

		// ── the three structural exemptions ────────────────────────────────────────────────────────
		{
			name: 'exemption (a): a route module is instantiated by the ROUTER — no caller exists',
			filename: ROUTE,
			code: `${REACT}export function RouteComponent() { return <div>ok</div> }`,
		},
		{
			name: 'exemption (b): a context Provider renders no element — ProviderProps is { value, children }',
			filename: APP,
			code: `${REACT}${cn}const Ctx = React.createContext(0)\nfunction Inner({ className, ...props }: ComponentProps<'div'>) { return <div className={cn(className)} {...props} /> }\nexport function Panel({ value }: { value: number }) { return <Ctx.Provider value={value}><Inner /></Ctx.Provider> }`,
		},
		{
			name: 'exemption (b): a headless root has no className on its Props — demanding one is demanding a tsc error',
			filename: APP,
			code: `${REACT}${HEADLESS}export function Popover({ children }: RootProps) { return <Root>{children}</Root> }`,
		},
		{
			name: 'a fragment root has no single host element to attach a class to',
			filename: APP,
			code: `${REACT}export function Pair({ a, b }: { a: ReactNode; b: ReactNode }) { return <>{a}{b}</> }`,
		},

		// ── population + preconditions ─────────────────────────────────────────────────────────────
		{
			name: 'the spread is owed only when the props ARE the root vocabulary — a narrow props type is not',
			filename: APP,
			code: `${REACT}${cn}export function Swatch({ className, token }: Pick<ComponentProps<'div'>, 'className'> & { token: string }) { return <div className={cn('size-4', className)}>{token}</div> }`,
		},
		{
			name: 'a REQUIRED className is a semantic input (a colour token), not the hand-typed optional shape',
			filename: ROUTE_COMPONENT,
			code: `${REACT}interface DotProps { className: string }\nexport function Dot({ className }: DotProps) { return <span className={className} /> }`,
		},
	],

	invalid: [
		{
			// THE WITNESS for the 2026-08-14 doctrine widening. This exact fixture used to sit in
			// `valid`, named "a module-private helper has no caller outside its own file". Measured at
			// the time: 36 module-private components returned a host root with no className, 25 of them
			// in four files. Move it back to `valid` and the widening silently stops being enforced.
			name: 'a module-private helper owes className too — export shape is not an exemption',
			filename: APP,
			code: `${REACT}function Cell({ value }: { value: string }) { return <td>{value}</td> }\nexport function Row({ className, ...props }: ComponentProps<'tr'>) { return <tr className={className} {...props}><Cell value="x" /></tr> }`,
			errors: [{ messageId: 'noSurface' }],
		},
		{
			name: 'no className surface on a DOM root — the caller cannot reach it',
			filename: APP,
			code: `${REACT}export function Row({ item }: { item: string }) { return <div>{item}</div> }`,
			errors: [{ messageId: 'noSurface' }],
		},
		{
			name: 'no className surface on an UPPERCASE root — className is universal, not DOM-only',
			filename: APP,
			code: `${REACT}${CARD}export function ThreadCard({ title }: { title: string }) { return <Card>{title}</Card> }`,
			errors: [{ messageId: 'noSurface' }],
		},
		{
			name: 'barrel-exported and non-conforming — invisible to the `^export function X` walker',
			filename: APP,
			code: `${REACT}function Badge({ label }: { label: string }) { return <span>{label}</span> }\nexport { Badge }`,
			errors: [{ messageId: 'noSurface' }],
		},
		{
			name: 'arrow function, non-conforming',
			filename: APP,
			code: `${REACT}export const Pill = ({ label }: { label: string }) => <span>{label}</span>`,
			errors: [{ messageId: 'noSurface' }],
		},
		{
			name: 'forwardRef, non-conforming',
			filename: APP,
			code: `${REACT}export const Row = React.forwardRef<HTMLDivElement, { label: string }>(function Row({ label }, ref) { return <div ref={ref}>{label}</div> })`,
			errors: [{ messageId: 'noSurface' }],
		},
		{
			name: 'export default, non-conforming',
			filename: APP,
			code: `${REACT}export default function Panel({ label }: { label: string }) { return <div>{label}</div> }`,
			errors: [{ messageId: 'noSurface' }],
		},
		{
			name: 'className destructured and then dropped — the caller passes a class and nothing happens',
			filename: APP,
			code: `${REACT}export function Panel({ className, ...props }: ComponentProps<'div'>) { return <div className="p-4" {...props} /> }`,
			errors: [{ messageId: 'clobbered' }],
		},
		{
			name: 'destructured, dropped, and nothing spread either — nowhere for the class to land',
			filename: APP,
			code: `${REACT}export function Panel({ className, children }: ComponentProps<'div'>) { return <div className="p-4">{children}</div> }`,
			errors: [{ messageId: 'notPlumbed' }],
		},
		{
			name: 'literal className next to a spread — last write wins, one side erases the other',
			filename: APP,
			code: `${REACT}export function Toaster(props: ComponentProps<'div'>) { return <div className="toaster group" {...props} /> }`,
			errors: [{ messageId: 'clobbered' }],
		},
		{
			name: 'a cn() that forgot the caller value is the same clobber, just harder to see',
			filename: APP,
			code: `${REACT}${cn}export function Toaster(props: ComponentProps<'div'>) { return <div className={cn('toaster', 'group')} {...props} /> }`,
			errors: [{ messageId: 'clobbered' }],
		},
		{
			name: 'typed as the root vocabulary, merges className, spreads nothing — every other prop is dropped',
			filename: APP,
			code: `${REACT}${cn}export function Sidebar({ className }: ComponentProps<'aside'>) { return <aside className={cn('w-60', className)} /> }`,
			errors: [{ messageId: 'noSpread' }],
		},
		{
			name: 'hand-typed `className?: string`',
			filename: APP,
			code: `${REACT}${cn}interface PanelProps { className?: string; label: string }\nexport function Panel({ className, label }: PanelProps) { return <div className={cn('p-4', className)}>{label}</div> }`,
			errors: [{ messageId: 'handTyped' }],
		},
		{
			name: 'a -components/ module is NOT exempt — the route is its caller',
			filename: ROUTE_COMPONENT,
			code: `${REACT}export function StatRow({ label }: { label: string }) { return <div>{label}</div> }`,
			errors: [{ messageId: 'noSurface' }],
		},
	],
})
