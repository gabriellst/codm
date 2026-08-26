/**
 * no-enum-widening — type-aware rule: a value whose type is a union of string literals
 * (an SDK/contracts enum) must never flow into a plain `string` slot. The widening point
 * is where exhaustiveness dies (packages/app/react/CLAUDE.md "SDK enums type everything
 * they touch"); name-based regex rails cannot see types, so this rule asks the checker.
 *
 * Flags:
 *   W-01  call argument: literal-union value passed to a `string`-typed parameter
 *   W-02  declaration/property: literal-union value assigned to an explicit `string` slot
 *
 * Principled exemptions (the canon's own escape hatches):
 *   - template literals (typed t() keys re-narrow at the call boundary)
 *   - explicit String(x) / x.toString() / `as string` (visible, greppable opt-outs)
 *   - unions with non-literal members or fewer than 2 literals (not closed sets)
 */
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils'
import ts from 'typescript'
import { REPO } from '../../template.config'

const createRule = ESLintUtils.RuleCreator(name => `${REPO.repoUrl}#${name}`)

function isLiteralStringUnion(type: ts.Type): boolean {
	if (!type.isUnion()) return false
	const members = type.types.filter(t => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)))
	return members.length >= 2 && members.every(t => t.isStringLiteral())
}

function isPlainString(type: ts.Type): boolean {
	// exactly `string` — not a literal, not a union of literals
	return (type.flags & ts.TypeFlags.String) !== 0 && !type.isUnion() && !type.isStringLiteral()
}

export const noEnumWidening = createRule({
	name: 'no-enum-widening',
	meta: {
		type: 'problem',
		docs: { description: 'Disallow widening string-literal unions (SDK enums) to plain string' },
		messages: {
			widened:
				'Enum widening: a closed string-literal union flows into a plain `string` {{slot}} — exhaustiveness dies here. Keep the SDK enum type (Record<Enum, …>, typed params, z.enum) or opt out explicitly with String(x).',
		},
		schema: [],
	},
	defaultOptions: [],
	create(context) {
		const services = ESLintUtils.getParserServices(context)
		const checker = services.program.getTypeChecker()

		function widens(node: TSESTree.Node, target: ts.Type): boolean {
			if (node.type === 'TemplateLiteral' || node.type === 'TSAsExpression') return false
			if (node.type === 'CallExpression') {
				const callee = node.callee
				if (callee.type === 'Identifier' && callee.name === 'String') return false
				if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier' && callee.property.name === 'toString') return false
			}
			const source = checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(node))
			return isLiteralStringUnion(source) && isPlainString(target)
		}

		return {
			CallExpression(node) {
				const tsNode = services.esTreeNodeToTSNodeMap.get(node)
				const signature = checker.getResolvedSignature(tsNode)
				if (!signature) return
				// External sinks (DOM, libraries) own their signatures — widening at a
				// boundary we don't control is inherent, not a violation. Only OUR slots gate.
				const decl = signature.getDeclaration()
				const declFile = decl?.getSourceFile().fileName ?? ''
				if (declFile.includes('node_modules') || declFile.includes('lib.') || declFile === '') return
				node.arguments.forEach((arg, i) => {
					const param = signature.getParameters()[i]
					if (!param) return
					const paramType = checker.getTypeOfSymbolAtLocation(param, tsNode)
					if (widens(arg, paramType)) {
						context.report({ node: arg, messageId: 'widened', data: { slot: 'parameter' } })
					}
				})
			},
			VariableDeclarator(node) {
				if (!node.init || node.id.type !== 'Identifier' || !node.id.typeAnnotation) return
				const target = checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(node.id))
				if (widens(node.init, target)) {
					context.report({ node: node.init, messageId: 'widened', data: { slot: 'declaration' } })
				}
			},
		}
	},
})

/**
 * no-raw-enum-render — a string-literal-union value rendered directly as JSX text is a raw
 * enum value shown to users (the #1 measured family: label catalogs skipped). Labels go
 * through t(`enums.<Enum>.${v}`) or enumLabel(...) — both force the typed catalog into
 * BOTH locale files. Attribute positions, template literals and function calls are not
 * flagged (keys, aria, class names are not display text).
 */
export const noRawEnumRender = createRule({
	name: 'no-raw-enum-render',
	meta: {
		type: 'problem',
		docs: { description: 'Disallow rendering raw enum values as JSX text' },
		messages: {
			raw: 'Raw enum value rendered as UI text — labels come from the typed catalog: t(`enums.<Enum>.${value}`) or enumLabel(...). Rendering the wire value skips the catalog in both locales.',
		},
		schema: [
			{
				type: 'object',
				properties: { allowTypes: { type: 'array', items: { type: 'string' } } },
				additionalProperties: false,
			},
		],
	},
	defaultOptions: [{ allowTypes: [] as string[] }],
	create(context, [options]) {
		const services = ESLintUtils.getParserServices(context)
		const checker = services.program.getTypeChecker()
		const allow = new Set(options.allowTypes)
		return {
			JSXExpressionContainer(node) {
				if (node.parent.type !== 'JSXElement' && node.parent.type !== 'JSXFragment') return
				const expr = node.expression
				if (expr.type === 'JSXEmptyExpression' || expr.type === 'TemplateLiteral' || expr.type === 'CallExpression') return
				const tsNode = services.esTreeNodeToTSNodeMap.get(expr)
				const type = checker.getTypeAtLocation(tsNode)
				if (!isLiteralStringUnion(type)) return
				// Enums whose VALUES are the international display form (ISO codes) are
				// allowlisted by type name — the visible, reviewable exemption channel
				// (inline disables are banned house-wide).
				const aliasName = type.aliasSymbol?.name ?? checker.typeToString(type)
				if (allow.has(aliasName) || [...allow].some(a => checker.typeToString(type).includes(a))) return
				context.report({ node: expr, messageId: 'raw' })
			},
		}
	},
})

export default { rules: { 'no-enum-widening': noEnumWidening, 'no-raw-enum-render': noRawEnumRender } }
