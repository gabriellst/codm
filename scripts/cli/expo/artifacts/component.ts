// `bun cli component <route> <Name>` (mobile) — route-scoped RN component
// scaffolder. Output lives at:
//
//   packages/app/expo/app/<route>/-components/<Name>/index.tsx
//
// Mirrors the web flag surface (`--recipe`, `--i18n`, `--sdk`, `--state`,
// `--variants`, `--consts`) but emits RN primitives + `@/components/ui/*`
// from the expo design system. The web's `--as=section|div|...` polymorphism
// doesn't apply on mobile (no DOM), so we drop it and let the recipe dictate
// the root tag.

import type { Generator } from '../../types'
import { renderArtifact } from '../../snippet/render'
import { mobileRecipes } from '../recipes'
import { MOBILE_SDK_PACKAGE } from '../blocks/sdk'
import { parseVariantSpec } from '../util/flags'
import { parseCsv, readValue } from '../util/flags'
import { toCamelCase, toKebabCase, toPascalCase } from '../util/naming'

export const componentGenerator: Generator = async (pos, flags) => {
	const [routePath, rawName] = pos
	if (!routePath || !rawName) {
		console.error(
			[
				'component <route> <Name> [flags]',
				'',
				'Flags:',
				'  --recipe=<plain|section|card|empty-state>  (default: plain)',
				'  --sdk=<Identifier>                         SDK type/hook reference',
				'  --state=<csv>                              query|store|search (multi-value)',
				'  --store=<StoreName>                        required when --state includes store',
				'  --variants=<spec>                          CVA variants (size:sm,md|tone:default,muted)',
				'  --consts=<spec>                            semicolon-separated key=value pairs',
				'  --i18n=<prefix>                            required if recipe emits visible text',
			].join('\n'),
		)
		process.exit(1)
	}

	const recipeName = readValue(flags, 'recipe') ?? 'plain'
	const recipe = mobileRecipes[recipeName]
	if (!recipe) {
		console.error(`[component] unknown recipe "${recipeName}". Valid: ${Object.keys(mobileRecipes).join(', ')}`)
		process.exit(1)
	}

	const pascal = toPascalCase(rawName)
	const camel = toCamelCase(rawName)
	const kebab = toKebabCase(rawName)
	const i18nPrefix = readValue(flags, 'i18n')

	if (recipe.requiresI18n && !i18nPrefix) {
		console.error(`[component] --recipe=${recipeName} emits visible text — pass --i18n=<prefix>`)
		process.exit(1)
	}

	const sdk = readValue(flags, 'sdk')
	const storeName = readValue(flags, 'store')
	const stateValues = new Set(parseCsv(readValue(flags, 'state')))

	if (stateValues.has('store') && !storeName) {
		console.error('[component] --state=store requires --store=<StoreName>')
		process.exit(1)
	}

	// --- Imports (berzerk-style: plain function, no forwardRef / no React import) ---
	const importSet = new Set<string>()
	importSet.add(`import { View } from 'react-native'`)
	importSet.add(`import { cn } from '@/lib/utils'`)
	if (i18nPrefix) importSet.add(`import { useTranslation } from 'react-i18next'`)
	if (sdk) importSet.add(`import type { ${sdk} } from '${MOBILE_SDK_PACKAGE}'`)
	for (const line of recipe.extraImports) importSet.add(line)
	if (stateValues.has('query') && sdk) {
		// `useGet<Sdk>` / `useList<Sdk>` — pluralization is left to the user.
		importSet.add(`// TODO: import the right SDK hook (e.g. useGet${sdk} / useList${sdk}s)`)
	}
	if (stateValues.has('store') && storeName) {
		importSet.add(`import { use${toPascalCase(storeName)} } from '../-stores/${toKebabCase(storeName)}-store'`)
	}
	if (stateValues.has('search')) {
		importSet.add(`import { useLocalSearchParams } from 'expo-router'`)
	}

	// --- Variants (CVA) ---
	const variantsSpec = readValue(flags, 'variants')
	const variantsParsed = variantsSpec ? parseVariantSpec(variantsSpec) : {}
	const hasVariants = Object.keys(variantsParsed).length > 0
	let variantsDecl = ''
	if (hasVariants) {
		importSet.add(`import { cva, type VariantProps } from 'class-variance-authority'`)
		const variantEntries = Object.entries(variantsParsed)
		const variantBlock = variantEntries
			.map(([name, values]) => {
				const lines = values.map(v => `\t\t\t${v}: '',`).join('\n')
				return `\t\t${name}: {\n${lines}\n\t\t},`
			})
			.join('\n')
		const defaults = variantEntries.map(([name, values]) => `${name}: '${values[0]}'`).join(', ')
		variantsDecl = `\nconst ${camel}Variants = cva('flex-row items-center', {
	variants: {
${variantBlock}
	},
	defaultVariants: { ${defaults} },
})\n`
	}

	// --- Hooks ---
	const hookCalls: string[] = []
	if (i18nPrefix) hookCalls.push(`const { t } = useTranslation()`)
	if (stateValues.has('store') && storeName) hookCalls.push(`const state = use${toPascalCase(storeName)}()`)
	if (stateValues.has('search')) hookCalls.push(`const params = useLocalSearchParams()`)
	const hookCallsBlock = hookCalls.length ? `${hookCalls.map(h => `\t${h}`).join('\n')}\n` : ''

	const recipeBody = recipe.renderBody({ pascal, i18nPrefix })

	// --- Props interface (berzerk-style: plain interface, accepts className) ---
	const variantPropsExtends = hasVariants ? `extends VariantProps<typeof ${camel}Variants> ` : ''
	const propsInterface = `interface ${pascal}Props ${variantPropsExtends}{
	className?: string
}`

	const variantsCall = hasVariants ? `${camel}Variants(props)` : `''`

	// Delegate to the canonical snippet at .claude/skills/component/expo/registry.yaml.
	// Bindings: assembler computes the runtime-varying parts, the snippet owns shape.
	// `kebab` is unused now (berzerk components don't add accessibilityLabel by
	// default) — keep the binding off the call to satisfy interpolate's no-leftover check.
	void kebab
	const content = renderArtifact('component', 'expo', {
		imports: [...importSet].join('\n'),
		variantsDecl,
		propsInterface,
		Pascal: pascal,
		hookCallsBlock,
		rootTag: recipe.rootTag,
		variantsCall,
		recipeBody,
	})

	return [
		{
			filePath: `packages/app/expo/app/${routePath}/-components/${pascal}/index.tsx`,
			content,
		},
	]
}
