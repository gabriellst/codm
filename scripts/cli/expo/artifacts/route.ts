// `bun cli route <segment>` (mobile) — Expo Router screen scaffolder.
//
// Mirrors the web `route` flag contract where it makes sense and replaces
// the web-specific bits (TanStack `createFileRoute`, `staticData.breadcrumb`)
// with their mobile equivalents:
//   - Default-exported React component (Expo Router file-based routing)
//   - Optional inline Zod schema + `useTypedSearchParams(sdkSchema)` to give
//     the screen the same query-param contract as TanStack's
//     `validateSearch: zodValidator(...)`.
//   - `Stack.Screen options={{ title }}` for the per-screen header config
//
// Flags:
//   --i18n=<prefix>          Required. Drives `Stack.Screen` title + body
//   --detail                 Emit `[id].tsx` and read `useLocalSearchParams<{ id: string }>()`
//   --sdk=<SchemaName>       SDK Zod schema to `.and()` with inline fields
//   --search=<spec>          Inline `--search` DSL (string:type[?][=default])
//   --search-file=<path>     Escape hatch for complex schemas
//   --in-sheets              Target `(sheets)/<segment>/index.tsx` (modal sheet route)
//   --layout=<plain|stack>   `stack` (default) emits a `Stack.Screen` options
//                             config; `plain` skips it (use when this screen
//                             is a leaf inside a parent `_layout.tsx`)

import type { Generator } from '../../types'
import { renderArtifact } from '../../snippet/render'
import { lastStaticSegment, toCamelCase, toPascalCase } from '../util/naming'
import { readValue, requireValue } from '../util/flags'
import { MOBILE_SDK_PACKAGE, searchBlock } from '../blocks'
import { readSearchFile } from '../../frontend/util/search-file'

export const routeGenerator: Generator = async (pos, flags) => {
	const [routePath] = pos
	if (!routePath) {
		console.error(
			[
				'route <segment> --i18n=<prefix>',
				'    [--detail]',
				'    [--sdk=<SchemaName>]',
				'    [--search=<spec> | --search-file=<path>]',
				'    [--in-sheets]',
				'    [--layout=<plain|stack>]',
			].join('\n'),
		)
		process.exit(1)
	}

	const i18nPrefix = requireValue(flags, 'i18n', 'route')
	const isDetail = flags.detail === 'true'
	const inSheets = flags['in-sheets'] === 'true'
	const layout = (readValue(flags, 'layout') ?? 'stack') as 'plain' | 'stack'

	const segment = lastStaticSegment(routePath)
	const routePascal = toPascalCase(segment)
	const routeCamel = toCamelCase(segment)

	const sdk = readValue(flags, 'sdk')
	const searchValue = readValue(flags, 'search')
	const searchFile = readValue(flags, 'search-file')

	// Build the search-params block when either an SDK schema, an inline DSL
	// spec, or a `--search-file` was provided. Detail routes inherit their id
	// from the path segment and don't typically need a query schema.
	let searchImports: string[] = []
	let searchDecls: string[] = []
	let searchHooks: string[] = []
	if (!isDetail && (sdk || searchValue || searchFile)) {
		if (searchFile) {
			// `--search-file` brings its own `z.object({...})` body + imports.
			// Wrap with `.and()` when an SDK schema is provided.
			const file = await readSearchFile(searchFile)
			searchImports = [`import { z } from 'zod'`, `import { useTypedSearchParams } from '@/lib/typed-route'`, ...file.imports]
			if (sdk) searchImports.push(`import { ${sdk} } from '${MOBILE_SDK_PACKAGE}'`)
			const innerObj = `z.object({\n${file.zodBody}\n})`
			const schemaExpr = sdk ? `${sdk}.and(\n\t${innerObj},\n)` : innerObj
			searchDecls = [`const ${routeCamel}SearchSchema = ${schemaExpr}`]
			searchHooks = [`const [params, setParams] = useTypedSearchParams(${routeCamel}SearchSchema)`]
		} else {
			const block = searchBlock({ camel: routeCamel, spec: searchValue, sdkSchema: sdk })
			searchImports = block.imports ?? []
			searchDecls = block.declarations ?? []
			searchHooks = block.hookCalls ?? []
		}
	}

	// --- Imports (berzerk-style: combined expo-router import when both Stack +
	// useLocalSearchParams are needed; no per-symbol duplicate import lines) ---
	const importSet = new Set<string>()
	importSet.add(`import { View } from 'react-native'`)
	importSet.add(`import { useTranslation } from 'react-i18next'`)
	const expoRouterSymbols: string[] = []
	if (layout === 'stack') expoRouterSymbols.push('Stack')
	if (isDetail) expoRouterSymbols.push('useLocalSearchParams')
	if (expoRouterSymbols.length > 0) {
		importSet.add(`import { ${expoRouterSymbols.join(', ')} } from 'expo-router'`)
	}
	for (const line of searchImports) importSet.add(line)

	// --- Body composition ---
	// `detailParamLine` and `stackScreenBlock` carry their own trailing `\n`;
	// the snippet's YAML literal block adds the second `\n` that separates them
	// from the following line. The blank-line semantics are split between the
	// binding values and the YAML literal block — keep them consistent if you
	// reshape either side. No `void params` / `void setParams` noise — the
	// scaffold leaves `params` / `setParams` as declared destructured bindings;
	// noUnusedLocals pressure is the correct signal to wire them up rather than
	// silently voiding them.
	const detailParamLine = isDetail ? `\tconst { id } = useLocalSearchParams<{ id: string }>()\n` : ''
	const hooksBlock = [`const { t } = useTranslation()`, ...searchHooks].map(h => `\t${h}`).join('\n')
	const stackScreenBlock = layout === 'stack' ? `\t\t\t<Stack.Screen options={{ title: t('${i18nPrefix}.title') }} />\n` : ''
	const searchDeclsBlock = searchDecls.length ? `\n${searchDecls.join('\n')}\n` : ''

	const componentName = `${routePascal}${isDetail ? 'Detail' : ''}Screen`

	// Delegate to the canonical snippet at .claude/skills/route/expo/registry.yaml.
	// Bindings: assembler computes the runtime-varying blocks (imports, search
	// decls, hooks, optional detail param line, optional Stack.Screen line); the
	// snippet owns the screen shape (default-exported function, root View, etc.).
	const content = renderArtifact('route', 'expo', {
		imports: [...importSet].join('\n'),
		searchDeclsBlock,
		componentName,
		hooksBlock,
		detailParamLine,
		stackScreenBlock,
	})

	// File path resolution:
	//   --in-sheets → packages/app/expo/app/(sheets)/<segment>/index.tsx
	//   --detail     → packages/app/expo/app/<routePath>/[id].tsx
	//   default      → packages/app/expo/app/<routePath>/index.tsx
	const groupedPath = inSheets ? `(sheets)/${segment}` : routePath
	const filePath = isDetail ? `packages/app/expo/app/${groupedPath}/[id].tsx` : `packages/app/expo/app/${groupedPath}/index.tsx`

	return [{ filePath, content }]
}
