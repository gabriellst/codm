/**
 * component-quality — two house rules that gate UI defects name-based rails can't see well:
 *
 *   button-needs-handler  — a design-system <Button> with NO action wired (onClick/onPress,
 *     type="submit", asChild, href, formAction) is a DEAD button: text that does nothing. The
 *     fix is to wire it to a mutation/command — and if that command doesn't exist yet, create it.
 *   no-hardcoded-jsx-text — user-facing text (JSX text children + aria-label/placeholder/title/alt)
 *     must go through i18n (`t(...)`), never an inline literal. The typed-keys trick only catches
 *     keys you USE via t(); it cannot catch a literal that BYPASSES t() — this rule closes that gap
 *     (react CLAUDE.md "the typed i18n catalog, never strings in code").
 *
 * Both are the "detect" rung: they gate the whole repo AND every probe's output (probes run lint),
 * with the carriers (component skill + CLAUDE.md) as the paired "document" rung.
 */
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils'
import { REPO } from '../../template.config'

const createRule = ESLintUtils.RuleCreator(name => `${REPO.repoUrl}#${name}`)

// Attributes that wire a <Button> to an action. asChild / render → the action lives on the composed
// child (Base UI `render={<Link/>}` renders the Button AS that element, so navigation/handler is wired
// by the child). type="submit" → the enclosing form's onSubmit. href/formAction → navigation/submit.
const ACTION_ATTRS = new Set(['onClick', 'onPress', 'onPressIn', 'asChild', 'render', 'href', 'formAction', 'onSubmit'])

export const buttonNeedsHandler = createRule({
	name: 'button-needs-handler',
	meta: {
		type: 'problem',
		docs: { description: 'Disallow a <Button> with no action wired (a dead, text-only button)' },
		messages: {
			deadButton:
				'Dead button — <Button> has no action wired. Add onClick/onPress, type="submit" (in a form), or asChild a link. A text-only button does nothing; if the command/mutation it should call does not exist yet, create it.',
		},
		schema: [],
	},
	defaultOptions: [],
	create(context) {
		return {
			JSXOpeningElement(node) {
				if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'Button') return
				// Composition pattern: a <Button> passed as a PROP VALUE (Base UI `render={<Button/>}`,
				// or any `someProp={<Button/>}`) is wired by the PARENT component (like asChild) — not dead.
				const el = node.parent
				const container = el?.parent
				if (container?.type === 'JSXExpressionContainer' && container.parent?.type === 'JSXAttribute') return
				// A spread (`{...props}`) may carry onClick — we can't see it, so don't flag.
				if (node.attributes.some(a => a.type === 'JSXSpreadAttribute')) return
				const named = node.attributes.filter(
					(a): a is TSESTree.JSXAttribute => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier',
				)
				const names = new Set(named.map(a => (a.name as TSESTree.JSXIdentifier).name))
				// disabled placeholders / loading buttons are intentionally inert — not the defect.
				if (names.has('disabled')) return
				if ([...names].some(n => ACTION_ATTRS.has(n))) return
				const isSubmit = named.some(a => a.name.name === 'type' && a.value?.type === 'Literal' && a.value.value === 'submit')
				if (isSubmit) return
				context.report({ node, messageId: 'deadButton' })
			},
		}
	},
})

// Attributes whose string value is shown/read to users → must be i18n. (className/id/type/role/
// name/key/htmlFor/value/data-* are NOT user-facing and are never flagged.)
const USER_FACING_ATTRS = new Set(['aria-label', 'placeholder', 'title', 'alt'])
const HAS_LETTER = /[A-Za-zÀ-ÿ]/
// A dotted, space-free token is an i18n KEY or identifier (`enums.X.Y`, `a.b.c`), not display text.
const KEY_LIKE = /^[\w-]+(\.[\w-]+)+$/
// O NOME DA MARCA não se traduz: "CoDM" é o mesmo em pt, en e em qualquer locale futura, e passá-lo
// por t() criaria uma chave cujo valor é idêntico em todo catálogo — cerimônia que finge tradução.
// Fica como exceção NOMEADA (não um regex frouxo): só este literal exato escapa, e qualquer outro
// texto solto no JSX continua vermelho. Deriva da grafia canônica de packages/app/tauri/config/app.ts
// (DISPLAY_NAME) — duplicada aqui de propósito, porque a config do eslint não importa código do app.
const BRAND_NAME = REPO.brandDisplay
const isDisplayText = (s: string) => HAS_LETTER.test(s) && !KEY_LIKE.test(s.trim()) && s.trim() !== BRAND_NAME

// A string-literal leaf reached in a JSX-child expression position is display text that bypassed
// t() — the `{cond ? 'Connected' : 'Not connected'}` / `{String(x ? 'A' : 'B')}` family the plain
// JSXText visitor can't see. Recurse through the shapes that still land a literal in the child slot:
// ConditionalExpression (both arms), LogicalExpression (either side), and String(...)/x.toString()
// wrappers (the greppable enum-widening opt-out, often masking a hardcoded label). Anything else
// (identifiers, member access, t(...) calls, template literals) is not a bare literal and passes.
function hasDisplayLiteral(node: TSESTree.Expression | TSESTree.PrivateIdentifier): boolean {
	switch (node.type) {
		case 'Literal':
			return typeof node.value === 'string' && isDisplayText(node.value)
		case 'ConditionalExpression':
			return hasDisplayLiteral(node.consequent) || hasDisplayLiteral(node.alternate)
		case 'LogicalExpression':
			return hasDisplayLiteral(node.left) || hasDisplayLiteral(node.right)
		case 'CallExpression': {
			const c = node.callee
			const isStringCall = c.type === 'Identifier' && c.name === 'String'
			const isToString = c.type === 'MemberExpression' && c.property.type === 'Identifier' && c.property.name === 'toString'
			return (isStringCall || isToString) && node.arguments.some(a => a.type !== 'SpreadElement' && hasDisplayLiteral(a))
		}
		default:
			return false
	}
}

export const noHardcodedJsxText = createRule({
	name: 'no-hardcoded-jsx-text',
	meta: {
		type: 'problem',
		docs: { description: 'Disallow hardcoded user-facing text in JSX — use i18n t(...)' },
		messages: {
			text: "Hardcoded UI text — wrap it in i18n: t('<key>'). Inline literals bypass the typed catalog and ship untranslated in one locale.",
			attr: "Hardcoded {{attr}} text — use t('<key>'). User-facing attribute strings must go through i18n, never an inline literal.",
		},
		schema: [],
	},
	defaultOptions: [],
	create(context) {
		return {
			JSXText(node) {
				if (!isDisplayText(node.value)) return // whitespace / punctuation / numbers / i18n-key only
				context.report({ node, messageId: 'text' })
			},
			JSXExpressionContainer(node) {
				// Only a JSX-CHILD expression (parent is an element/fragment) renders as text; the same
				// container in an attribute (`prop={...}`) is not display text and is handled elsewhere.
				if (node.parent.type !== 'JSXElement' && node.parent.type !== 'JSXFragment') return
				if (node.expression.type === 'JSXEmptyExpression') return
				if (hasDisplayLiteral(node.expression)) context.report({ node: node.expression, messageId: 'text' })
			},
			JSXAttribute(node) {
				if (node.name.type !== 'JSXIdentifier' || !USER_FACING_ATTRS.has(node.name.name)) return
				const v = node.value
				if (v?.type === 'Literal' && typeof v.value === 'string' && isDisplayText(v.value)) {
					context.report({ node: v, messageId: 'attr', data: { attr: node.name.name } })
				}
			},
		}
	},
})

export default {
	rules: {
		'button-needs-handler': buttonNeedsHandler,
		'no-hardcoded-jsx-text': noHardcodedJsxText,
	},
}
