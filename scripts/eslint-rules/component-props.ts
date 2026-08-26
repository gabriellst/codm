/**
 * component-props — the `className` doctrine as a type-aware AST rule (component bp-20 / bp-29).
 *
 * `className` is UNIVERSAL: a component that renders a root accepts `className` and merges it onto
 * that root, WHATEVER the case of the root tag. A `<ThreadCard />` whose root is `<Card>` and which
 * declares no className is a dead end — the caller cannot add `mt-4` or a `data-testid`, so the next
 * dev copies the component instead of composing it. The BLIND SPREAD (`{...props}`) is the separate,
 * CONDITIONAL half: it is owed only on a DOM root, because on a controlled root (Tabs/Select/
 * ToggleGroup) an arbitrary spread fights the controlled contract.
 *
 * MIGRATED 31/07 from `scripts/detectors/component-props.ts` (rules CP-01 / CP-02 / CP-04). The
 * walker split files with `^export function X`, so it could not see the design system at all: 34 of
 * the 40 files in `components/ui/` export through a barrel at the bottom (`export { Dialog,
 * DialogContent, … }`), which is 168 primitive components the walker read as six. `ui/` had to be
 * excluded — exactly where the doctrine matters most. An AST rule sees every declaration whatever
 * the export shape: barrel, arrow, `memo`, `forwardRef`, `export default`.
 *
 * WHY TYPED: "does this root accept a className?" is a cross-file question, and BOTH of the
 * doctrine's non-syntactic exemptions are the SAME typed question, answered once, with no whitelist:
 *   · a context Provider (`DataTableContext.Provider`) renders no element — `ProviderProps<T>` is
 *     `{ value, children }`, no `className`;
 *   · a headless Base UI root (`Popover.Root`, whose own d.ts says "Doesn't render its own HTML
 *     element") has no `className` on `Root.Props`.
 *   Demanding className from either would be demanding a tsc error. Everything else — intrinsic
 *   `<div>`, our `<Card>` (ComponentProps<'div'>), a node_modules `<Link>` — carries `className` on
 *   its props type and therefore owes the caller a passthrough.
 * The third exemption is structural and syntactic: a TanStack route module is instantiated by the
 * ROUTER, so it has no caller to pass a prop. `src/routes/**` minus any `-`-prefixed segment is
 * exactly the router's own file set (a `-` prefix is what excludes a directory from routing).
 *
 * POPULATION — EVERY component that returns a host root, exported or module-private.
 *
 * This was narrower until 2026-08-14: only what another module could render (named export, bottom
 * barrel, `export default`). The old argument was that the harm — a caller that cannot compose, so
 * it copies — needs a caller OUTSIDE the file, and a module-private helper's only caller is its own
 * file, which owns both sides of the edit.
 *
 * Measured, and that is what retired it: **36 module-private components returned a host root with
 * no `className`**, and they were not evenly spread — 25 of the 36 sat in four files
 * (`HomeDashboard/index.tsx` alone held 8). The population the exemption protected was not "a
 * helper with one local caller"; it was `WorkspaceCard`, `NavItem`, `StatTile`, `ActivityRow` —
 * cards and rows, the exact shape that gets promoted to a shared component later and arrives
 * already non-compliant. And an agent reading one of them learns the non-compliant shape and copies
 * it, which is the same harm the doctrine names, one file earlier.
 *
 * `CP-04` says className is UNIVERSAL. An exemption keyed on export shape is not universal. The
 * rule now matches the doctrine it enforces.
 *
 * The cheaper structural fix — split those four files so the sub-components become their own
 * exported modules, and the OLD population would already cover them — was considered and not
 * taken: it is a refactor of product code, while this is one line of rule.
 *
 * ONE REPORT PER COMPONENT, cheapest fix first: extending the root's props type hands you the
 * surface AND the spread, so reporting all three would be three names for one edit.
 */
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils'
import type ts from 'typescript'
import { REPO } from '../../template.config'

const createRule = ESLintUtils.RuleCreator(name => `${REPO.repoUrl}#${name}`)

type Fn = TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression
type Jsx = TSESTree.JSXElement | TSESTree.JSXFragment

const FN_SELECTOR = 'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression'

/**
 * A props type "extends the root's vocabulary" when it carries essentially all of the root's own
 * props — `ComponentProps<'aside'>` covers 100% of `<aside>`, a hand-written `{ item: T }` covers
 * ~0%, and `ComponentProps<typeof DayPicker>` covers almost none of `<div>`. The threshold only has
 * to separate those populations; it is not a knob to tune.
 */
const VOCABULARY_COVERAGE = 0.9

/**
 * Exemption (a) — a TanStack route module. `src/routes/**` is the router's own file set: it
 * instantiates those components, so there is no caller and nothing to forward. A `-`-prefixed
 * segment (`-components/`, `-hooks/`) is precisely what the router EXCLUDES from routing, so those
 * are ordinary modules with ordinary callers and stay in scope.
 */
export function isRouteModule(filename: string): boolean {
	const path = filename.replaceAll('\\', '/')
	const at = path.indexOf('/src/routes/')
	if (at === -1) return false
	return !path
		.slice(at + '/src/routes/'.length)
		.split('/')
		.some(segment => segment.startsWith('-'))
}

/** The name a component is known by — through `memo()` / `forwardRef()` wrappers and `export default`. */
function componentName(fn: Fn): string | null {
	if (fn.type !== 'ArrowFunctionExpression' && fn.id) return fn.id.name
	let node: TSESTree.Node | undefined = fn.parent
	while (node?.type === 'CallExpression') node = node.parent // memo(forwardRef(fn))
	if (node?.type === 'VariableDeclarator' && node.id.type === 'Identifier') return node.id.name
	if (node?.type === 'ExportDefaultDeclaration') return 'The default export'
	return null
}

/** JSX sitting directly in an expression slot (`return <div/>`, `() => <div/>`), through an `as` cast. */
function jsxOf(node: TSESTree.Node): Jsx | null {
	if (node.type === 'JSXElement' || node.type === 'JSXFragment') return node
	if (node.type === 'TSAsExpression' || node.type === 'TSNonNullExpression') return jsxOf(node.expression)
	return null
}

const isFunctionNode = (node: TSESTree.Node): boolean =>
	node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression'

/** Depth-first walk of a node's own subtree; `visit` returns false to stop descending. */
function walk(node: TSESTree.Node, visit: (node: TSESTree.Node) => boolean): void {
	if (!visit(node)) return
	for (const key of Object.keys(node) as (keyof typeof node)[]) {
		if (key === 'parent') continue
		const value = node[key] as unknown
		for (const child of Array.isArray(value) ? value : [value]) {
			if (child && typeof child === 'object' && typeof (child as TSESTree.Node).type === 'string') {
				walk(child as TSESTree.Node, visit)
			}
		}
	}
}

/**
 * The component's root: the JSX of its LAST return — not counting JSX returned by a nested function.
 * Last, not first, because everything before it is a guard (`if (!container) return <Splash/>`,
 * `if (loading) return <Skeleton/>`); the component's identity is the shape it renders when it has
 * everything it needs, and an early guard's root is not what the caller composes against.
 */
export function returnedRoot(fn: Fn): Jsx | null {
	if (fn.body.type !== 'BlockStatement') return jsxOf(fn.body)
	let found: Jsx | null = null
	walk(fn.body, node => {
		if (node !== fn.body && isFunctionNode(node)) return false
		if (node.type === 'ReturnStatement' && node.argument) {
			const jsx = jsxOf(node.argument)
			if (jsx) found = jsx
		}
		return true
	})
	return found
}

/** Local bindings holding the caller's className: `{ className }`, `{ className: extra }`. */
function classNameLocals(fn: Fn): Set<string> {
	const locals = new Set<string>(['className'])
	const param = fn.params[0]
	if (param?.type === 'ObjectPattern') {
		for (const prop of param.properties) {
			if (prop.type !== 'Property' || prop.key.type !== 'Identifier' || prop.key.name !== 'className') continue
			if (prop.value.type === 'Identifier') locals.add(prop.value.name)
			if (prop.value.type === 'AssignmentPattern' && prop.value.left.type === 'Identifier') locals.add(prop.value.left.name)
		}
	}
	return locals
}

/** Does this subtree carry the caller's className — the destructured binding, or `<bag>.className`? */
function referencesClassName(node: TSESTree.Node, locals: Set<string>): boolean {
	let found = false
	walk(node, current => {
		if (found) return false
		if (current.type === 'Identifier' && locals.has(current.name)) found = true
		if (current.type === 'MemberExpression' && current.property.type === 'Identifier' && current.property.name === 'className') found = true
		return !found
	})
	return found
}

const classNameAttribute = (opening: TSESTree.JSXOpeningElement): TSESTree.JSXAttribute | undefined =>
	opening.attributes.find(
		(a): a is TSESTree.JSXAttribute => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === 'className',
	)

const hasSpread = (opening: TSESTree.JSXOpeningElement): boolean => opening.attributes.some(a => a.type === 'JSXSpreadAttribute')

/** Is there a `{...bag}` anywhere in this JSX — the shape that carries className without naming it? */
function subtreeHasSpread(root: Jsx): boolean {
	let found = false
	walk(root, node => {
		if (node.type === 'JSXSpreadAttribute') found = true
		return !found
	})
	return found
}

/** Did the component pull `className` OUT of its props bag? Then the rest no longer carries it. */
function destructuresClassName(fn: Fn): boolean {
	const param = fn.params[0]
	if (param?.type !== 'ObjectPattern') return false
	return param.properties.some(p => p.type === 'Property' && p.key.type === 'Identifier' && p.key.name === 'className')
}

/** How the root is written, for the message: `div`, `Card`, `Popover.Root`. */
function rootLabel(name: TSESTree.JSXTagNameExpression): string {
	if (name.type === 'JSXIdentifier') return name.name
	if (name.type === 'JSXMemberExpression') return `${rootLabel(name.object)}.${name.property.name}`
	return `${name.namespace.name}:${name.name.name}`
}

export const componentProps = createRule({
	name: 'component-props',
	meta: {
		type: 'problem',
		docs: { description: 'Require a component to accept className and merge it onto its root (component bp-20 / bp-29)' },
		messages: {
			noSurface:
				'{{name}} renders a <{{root}}> root but declares no className — the caller cannot reach it and will copy this component instead of composing it. Type the props from the root ({{suggest}}): className comes with the rest of the root vocabulary.',
			notPlumbed:
				'{{name}} declares className but never lands it on what it renders — the caller passes a class and nothing happens. Merge it on the <{{root}}> root with cn(...).',
			clobbered:
				"{{name}} sets a className on its <{{root}}> root that does not include the caller's, next to a {...spread} that carries it — last write wins, so one of the two class lists silently disappears. cn(defaults, className) is what merges them.",
			noSpread:
				'{{name}} types its props as the <{{root}}> vocabulary but never spreads them onto anything it renders — every prop the caller is invited to pass (id, aria-*, data-testid, handlers) is silently dropped. Add {...props} on the root.',
			handTyped:
				"Hand-typed `className?: string` — extend the root's vocabulary instead (ComponentProps<root>, or the primitive's own *.Props), which already carries className plus every other prop the root accepts.",
		},
		schema: [],
	},
	defaultOptions: [],
	create(context) {
		const services = ESLintUtils.getParserServices(context)
		const checker = services.program.getTypeChecker()
		const routeModule = isRouteModule(context.filename)

		/** The props type a JSX element accepts, as the checker sees it (undefined when unresolvable). */
		function jsxPropsType(opening: TSESTree.JSXOpeningElement): ts.Type | undefined {
			const tsNode = services.esTreeNodeToTSNodeMap.get(opening) as ts.JsxOpeningElement | ts.JsxSelfClosingElement
			return checker.getContextualType(tsNode.attributes)
		}

		/** Exemption (b): a root whose props type has no `className` renders no HTML element of its own. */
		function rootAcceptsClassName(opening: TSESTree.JSXOpeningElement): boolean {
			const propsType = jsxPropsType(opening)
			if (!propsType) return true // unresolvable → demand className; that is the safe default
			return propsType.getProperties().some(p => p.name === 'className')
		}

		/** The declared props type of a component — the implementation signature's first parameter. */
		function componentPropsType(fn: Fn): ts.Type | undefined {
			const tsFn = services.esTreeNodeToTSNodeMap.get(fn) as ts.SignatureDeclaration
			const param = tsFn.parameters[0]
			return param ? checker.getTypeAtLocation(param) : undefined
		}

		/**
		 * Union constituents, because an OVERLOADED component (`Combobox`, `Select`: an enum-driven
		 * shape plus the headless primitive shape) is implemented with the union of its signatures.
		 * The contract is each branch, so a className that exists on the branch which renders a host
		 * element is a real surface — the headless branch could not carry one anyway.
		 */
		const constituents = (type: ts.Type): ts.Type[] => (type.isUnion() ? type.types : [type])

		const declaresClassName = (type: ts.Type | undefined): boolean => !!type && constituents(type).some(t => !!t.getProperty('className'))

		/** Does the component's props type carry (nearly) the whole vocabulary of its DOM root? */
		function extendsRootVocabulary(propsType: ts.Type | undefined, rootType: ts.Type | undefined): boolean {
			if (!propsType || !rootType) return false
			const rootProps = rootType.getProperties()
			if (rootProps.length === 0) return false
			const covered = rootProps.filter(p => constituents(propsType).some(t => !!t.getProperty(p.name))).length
			return covered / rootProps.length >= VOCABULARY_COVERAGE
		}

		return {
			[FN_SELECTOR](node: Fn) {
				if (routeModule) return
				const name = componentName(node)
				if (!name || !/^[A-Z]/.test(name)) return
				const root = returnedRoot(node)
				if (!root || root.type === 'JSXFragment') return // no single host root to attach a class to
				const opening = root.openingElement
				if (!rootAcceptsClassName(opening)) return

				const label = rootLabel(opening.name)
				const intrinsic = opening.name.type === 'JSXIdentifier' && /^[a-z]/.test(label)
				const suggest = intrinsic ? `ComponentProps<'${label}'>` : `ComponentProps<typeof ${label}>`
				const propsType = componentPropsType(node)

				if (!declaresClassName(propsType)) {
					context.report({ node: opening.name, messageId: 'noSurface', data: { name, root: label, suggest } })
					return
				}
				const own = classNameAttribute(opening)
				const spread = hasSpread(opening)
				const locals = classNameLocals(node)
				// A className on the root that does NOT carry the caller's value, sitting next to a spread
				// that does, is the clobber: whichever is written last wins, so either the caller erases the
				// component's classes or the component erases the caller's. It reads identically whether the
				// attribute is a literal (`className="toaster group"`) or a cn() call that simply forgot the
				// caller's value — the caller's class still vanishes without a trace.
				const ownCarriesCallerClass = own?.value?.type === 'JSXExpressionContainer' && referencesClassName(own.value.expression, locals)
				if (own && !ownCarriesCallerClass && spread) {
					context.report({ node: own, messageId: 'clobbered', data: { name, root: label } })
					return
				}
				// The caller's value may legitimately land BELOW the root — a `<Portal>`/`<Positioner>`
				// wrapper renders no element of its own, so `DialogContent` merges on the inner Popup, and
				// `Table` merges on the `<table>` inside its scroll container. What matters is that the
				// value is USED, not which line uses it. A `{...bag}` counts only while className is still
				// IN the bag: once you destructure `{ className, ...props }`, the rest cannot carry it and
				// an explicit merge is the only way the caller's class survives.
				const landed = referencesClassName(root, locals) || (!destructuresClassName(node) && subtreeHasSpread(root))
				if (!landed) {
					context.report({ node: opening.name, messageId: 'notPlumbed', data: { name, root: label } })
					return
				}
				// The spread half of bp-20, and only where the doctrine puts it: a DOM root, on a component
				// that TYPED itself as that root's vocabulary. Not spreading it ANYWHERE is the defect —
				// `Table` types itself from `<table>` and spreads onto the `<table>` inside its scroll
				// container, which is where those props belong; the wrapper `<div>` could not take them.
				if (intrinsic && !subtreeHasSpread(root) && extendsRootVocabulary(propsType, jsxPropsType(opening))) {
					context.report({ node: opening.name, messageId: 'noSpread', data: { name, root: label } })
				}
			},
			TSPropertySignature(node) {
				if (node.key.type !== 'Identifier' || node.key.name !== 'className' || !node.optional) return
				if (node.typeAnnotation?.typeAnnotation.type !== 'TSStringKeyword') return
				context.report({ node, messageId: 'handTyped' })
			},
		}
	},
})

export default {
	rules: {
		'component-props': componentProps,
	},
}
