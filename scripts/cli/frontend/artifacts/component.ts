// `bun cli component <route> <Name>` — recipe-driven scaffolder.
//
// Spec §5.2 contract: recipe + blocks compose into a forwardRef'd TSX component.
// The assembler runs each active block, dedupes imports, and renders the final
// file. Recipes (plain | section | card | empty-state) preset block bundles;
// individual blocks can be added/removed via flags.

import { REPO } from '../../../../template.config'
import type { Generator } from '../../types'
import { recipes } from '../recipes'
import { blocks, ELEMENT_INTERFACES, type BlockContext, type BlockOutput } from '../blocks'
import { writeI18n } from './i18n'
import { toCamelCase, toKebabCase, toPascalCase } from '../util/naming'
import { parseCsv, readValue } from '../util/flags'

// Read the generated SDK enum's wire values so `--labels` can seed the i18n catalog
// (`enums.<EnumName>.<VALUE>`) without the caller retyping the member list. Kubb emits
// one file per enum: `const <EnumName>Enum = { KEY: "VALUE", ... } as const`.
async function resolveSdkEnumValues(enumName: string): Promise<string[] | null> {
	const surfaces = [
		`packages/client/dist/typescript/src/typescript/types/${enumName}.ts`,
		`packages/client/dist/typescript/src/go/types/${enumName}.ts`,
	]
	for (const path of surfaces) {
		const file = Bun.file(path)
		if (!(await file.exists())) continue
		const source = await file.text()
		const block = source.match(new RegExp(`const ${enumName}Enum = \\{([\\s\\S]*?)\\} as const`))
		if (!block) continue
		const values = [...block[1].matchAll(/:\s*"([^"]+)"/g)].map(m => m[1])
		if (values.length > 0) return values
	}
	return null
}

// Merge multiple `import { ... } from '<REPO.sdkSpecifier>'` lines
// into a single combined import, preserving type-only markers. Other modules
// are passed through unchanged.
function mergeSdkImports(lines: string[]): string[] {
	const sdkRegex = new RegExp(String.raw`^import\s+\{\s*([^}]+)\s*\}\s+from\s+['"]${REPO.sdkSpecifier.replaceAll('/', String.raw`\/`)}['"]\s*$`)
	const sdkSymbols = new Set<string>()
	const passthrough: string[] = []
	for (const line of lines) {
		const m = line.match(sdkRegex)
		if (m) {
			for (const sym of m[1].split(',')) sdkSymbols.add(sym.trim())
		} else {
			passthrough.push(line)
		}
	}
	if (sdkSymbols.size === 0) return passthrough
	const combined =
		sdkSymbols.size === 1
			? `import { ${[...sdkSymbols][0]} } from '${REPO.sdkSpecifier}'`
			: `import {\n\t${[...sdkSymbols].join(',\n\t')},\n} from '${REPO.sdkSpecifier}'`
	return [...passthrough, combined]
}

export const componentGenerator: Generator = async (pos, flags) => {
	const [routePath, rawName] = pos
	if (!routePath || !rawName) {
		console.error(
			[
				'component <route> <Name> [flags]',
				'',
				'Flags:',
				'  --recipe=<plain|section|card|empty-state>  (default: plain)',
				'  --as=<section|div|article|aside|button|a>  (default: per recipe, else div)',
				'  --sdk=<Identifier>                         SDK type/hook reference',
				'  --state=<csv>                              query|store|search (multi-value)',
				'  --store=<StoreName>                        required when --state includes store',
				'  --variants=<spec>                          CVA variants (size:sm,md|tone:default,muted)',
				'  --labels                                   typed enum-label wiring (requires --sdk=<Enum>): t(`enums.<EnumName>.${value}`) helper + auto-seeds the locale keys from the SDK enum values',
				'  --consts=<spec>                            semicolon-separated key=value pairs',
				'  --i18n=<prefix>                            required if recipe/template emits text',
				'  --skeleton                                 inline data===undefined skeleton block',
				'  --no-<block>                               opt out of recipe-enabled block',
				'  --no-i18n-write                            skip JSON write (still emits t() calls)',
			].join('\n'),
		)
		process.exit(1)
	}

	const recipeName = readValue(flags, 'recipe') ?? 'plain'
	const recipe = recipes[recipeName]
	if (!recipe) {
		console.error(`[component] unknown recipe "${recipeName}". Valid: ${Object.keys(recipes).join(', ')}`)
		process.exit(1)
	}

	const ctx: BlockContext = {
		pascal: toPascalCase(rawName),
		camel: toCamelCase(rawName),
		kebab: toKebabCase(rawName),
		routePath,
		sdk: readValue(flags, 'sdk'),
		storeName: readValue(flags, 'store'),
		i18nPrefix: readValue(flags, 'i18n'),
	}

	if (recipe.requiresI18n && !ctx.i18nPrefix) {
		console.error(`[component] --recipe=${recipeName} emits visible text — pass --i18n=<prefix>`)
		process.exit(1)
	}

	const stateValues = new Set(parseCsv(readValue(flags, 'state')))
	const noBlocks = new Set<string>()
	for (const key of Object.keys(flags)) {
		if (key.startsWith('no-') && flags[key] === 'true') noBlocks.add(key.slice(3))
	}

	// Determine active block set (recipe defaults + explicit flag triggers).
	const active = new Set(recipe.blocks)
	if (stateValues.has('query')) active.add('query')
	if (stateValues.has('store')) active.add('store')
	if (stateValues.has('search')) active.add('search')
	if (flags.variants) active.add('variants')
	if (flags.labels === 'true') active.add('labels')
	if (flags.consts) active.add('consts')
	if (ctx.i18nPrefix) active.add('i18n')
	if (flags.skeleton === 'true') active.add('skeleton')
	// The labels block imports the enum type itself — the bare sdk import would be unused.
	if (ctx.sdk && !active.has('labels')) active.add('sdk')
	for (const blk of noBlocks) active.delete(blk)

	// Element + interface
	const elementTag = readValue(flags, 'as') ?? recipe.defaultElement ?? 'div'
	const iface = ELEMENT_INTERFACES[elementTag] ?? 'HTMLElement'

	// Validate --store=<StoreName> when state includes store
	if (active.has('store') && !ctx.storeName) {
		console.error('[component] --state=store requires --store=<StoreName>')
		process.exit(1)
	}

	// Validate --labels needs --sdk
	if (active.has('labels') && !ctx.sdk) {
		console.error('[component] --labels requires --sdk=<Identifier> (an enum type)')
		process.exit(1)
	}

	// Run blocks and collect outputs
	const outputs: BlockOutput[] = []
	for (const blockName of active) {
		const fn = blocks[blockName]
		if (!fn) continue
		// Pick the flag value to pass to the block
		const flagValue =
			blockName === 'variants' ? flags.variants : blockName === 'consts' ? flags.consts : blockName === 'sdk' ? ctx.sdk : undefined
		outputs.push(fn(ctx, flagValue))
	}

	// Aggregate
	const importSet = new Set<string>()
	const hookSet = new Set<string>() // dedupes identical lines (labels + i18n both call useTranslation)
	const hooks: string[] = []
	const declarations: string[] = []
	const i18nSlots = new Set<string>()
	const additionalExports: string[] = []
	let jsxBefore = ''

	for (const o of outputs) {
		o.imports?.forEach(i => {
			importSet.add(i)
		})
		o.hookCalls?.forEach(h => {
			if (hookSet.has(h)) return
			hookSet.add(h)
			hooks.push(h)
		})
		o.declarations?.forEach(d => {
			declarations.push(d)
		})
		o.exports?.forEach(e => {
			additionalExports.push(e)
		})
		o.i18nSlots?.forEach(s => {
			i18nSlots.add(s)
		})
		if (o.jsxBefore) jsxBefore += o.jsxBefore
	}
	// Recipe-contributed slots
	recipe.i18nSlots?.forEach(s => {
		i18nSlots.add(s)
	})

	// Always include React + cn even if no block requested them.
	importSet.add(`import * as React from 'react'`)
	importSet.add(`import { cn } from '@/lib/utils'`)

	const importLines = mergeSdkImports([...importSet])

	// Assemble JSX
	const hasVariants = active.has('variants')
	const propsInterface = hasVariants
		? `interface ${ctx.pascal}Props
\textends React.ComponentProps<'${elementTag}'>,
\t\tVariantProps<typeof ${ctx.camel}Variants> {}`
		: `interface ${ctx.pascal}Props extends React.ComponentProps<'${elementTag}'> {}`

	// CVA call: variants get pulled from props (size, tone, ...) — we don't know
	// the variant names without re-parsing, so use a spread for now and the user
	// adjusts. For zero-variant cases just pass '' as base.
	const variantsCall = hasVariants ? `${ctx.camel}Variants()` : `''`

	const propsDestructure = hasVariants ? `({ className, ...props }: ${ctx.pascal}Props)` : `({ className, ...props }: ${ctx.pascal}Props)`

	const recipeBody = recipe.renderBody
		? recipe.renderBody({ i18nPrefix: ctx.i18nPrefix, pascal: ctx.pascal })
		: `\t\t\t{/* Implement ${ctx.pascal} */}`

	const componentFn = `export function ${ctx.pascal}${propsDestructure} {
${hooks.map(h => `\t${h}`).join('\n')}${hooks.length ? '\n' : ''}${jsxBefore}
\treturn (
\t\t<${elementTag}
\t\t\tclassName={cn(${variantsCall}, className)}
\t\t\t{...props}
\t\t>
${recipeBody}
\t\t</${elementTag}>
\t)
}
`

	const content = [
		importLines.join('\n'),
		'',
		...(declarations.length ? declarations.concat(['']) : []),
		propsInterface,
		'',
		componentFn,
		...(additionalExports.length ? [''].concat(additionalExports) : []),
	].join('\n')

	// Auto-trigger i18n writer with referenced slots.
	if (ctx.i18nPrefix && flags['no-i18n-write'] !== 'true' && flags.print !== 'true') {
		const slots = [...i18nSlots]
		if (slots.length === 0) slots.push('title', 'subtitle')
		await writeI18n({ namespace: ctx.i18nPrefix, keys: slots })
	}

	// `--labels`: seed the enum's i18n catalog from the SDK values so the emitted
	// typed-template t() compiles immediately (lock-step pt/en, TODO[..] stubs to fill).
	if (active.has('labels') && ctx.sdk && flags['no-i18n-write'] !== 'true' && flags.print !== 'true') {
		const enumName = ctx.sdk.replace(/Enum$/, '')
		const values = await resolveSdkEnumValues(enumName)
		if (values) {
			await writeI18n({ namespace: `enums.${enumName}`, keys: values })
		} else {
			console.warn(
				`[component] --labels: could not resolve ${enumName}Enum values from the generated SDK — seed manually: bun cli i18n enums.${enumName} --keys=VALUE_A,VALUE_B,...`,
			)
		}
	}

	return [
		{
			filePath: `packages/app/react/src/routes/${routePath}/-components/${ctx.pascal}/index.tsx`,
			content,
		},
	]
}
