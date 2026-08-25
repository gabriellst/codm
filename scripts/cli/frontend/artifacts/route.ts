// `bun cli route <path>` — enriched TanStack route scaffolder.
//
// Spec §5.1 contract:
//   - --i18n=<prefix>           required for every route (rule 5: breadcrumb is visible text)
//   - --detail                  emits `/$id` variant; ignores search-schema flags
//   - --extend=<SDKSchemaName>  composes search schema via `.and()` against the SDK params schema
//   - --search=<spec>           inline DSL (see util/search-dsl.ts)
//   - --search-file=<path>      escape hatch for complex schemas (see util/search-file.ts)
//   - --sdk=<Identifier>        SDK type imports (List<X>QueryResponse on list routes; Get<X>QueryResponse on detail)
//   - --export-params-type      default on; emit `export type <RoutePascal>SearchParams = z.infer<...>`
//   - --export-item-type[=Name] emit `export type <Name or <RoutePascal>Item> = List<X>QueryResponse['items'][number]`
//   - --import=<spec>           extra import lines (`from1=sym1,sym2;from2=sym3`)
//   - --layout=<plain|app>      `app` (default) wraps in the canonical flex shell
//   - --loader[=<name>]         emite loaderDeps + loader com ensureQueryData (prefetch canon).
//                               Sem valor: deriva de --extend (listXQueryParamsSchema → listXQueryOptions).
//                               Com --detail: valor explícito obrigatório (não há --extend).

import { REPO } from '../../../../template.config'
import type { Generator } from '../../types'
import { writeI18n } from './i18n'
import { lastStaticSegment, toCamelCase, toPascalCase } from '../util/naming'
import { parseCsv, parseKvSpec, readBool, readValue, requireValue } from '../util/flags'
import { parseSearchSpec, renderField } from '../util/search-dsl'
import { readSearchFile } from '../util/search-file'

interface ExtraImport {
	from: string
	symbols: string[]
}

function parseImports(spec: string | undefined): ExtraImport[] {
	if (!spec) return []
	const out: ExtraImport[] = []
	for (const [from, symbolsCsv] of parseKvSpec(spec)) {
		out.push({ from, symbols: parseCsv(symbolsCsv) })
	}
	return out
}

export const routeGenerator: Generator = async (pos, flags) => {
	const [routePath] = pos
	if (!routePath) {
		console.error(
			[
				'route <path> --i18n=<prefix>',
				'    [--detail]',
				'    [--extend=<SDKSchemaName>]',
				'    [--sdk=<Identifier>]',
				'    [--search=<spec> | --search-file=<path>]',
				'    [--export-item-type[=<TypeName>]]',
				'    [--no-export-params-type]',
				'    [--import=<spec>]',
				'    [--layout=<plain|app>]',
				'    [--loader[=<queryOptionsName>]]',
			].join('\n'),
		)
		process.exit(1)
	}

	const i18nPrefix = requireValue(flags, 'i18n', 'route')
	const isDetail = flags.detail === 'true'
	const layout = (readValue(flags, 'layout') ?? 'app') as 'plain' | 'app'

	// For detail routes, lastStaticSegment skips the `$id` and returns the parent.
	// For list routes, it returns the actual segment.
	const segment = lastStaticSegment(routePath)
	const routePascal = toPascalCase(segment)
	const routeCamel = toCamelCase(segment)
	const navKey = segment

	const extend = readValue(flags, 'extend')
	const searchValue = readValue(flags, 'search')
	const searchFile = readValue(flags, 'search-file')
	const sdk = readValue(flags, 'sdk')

	// Detail path param — hoisted: the loader emission and the SDK import block both need it.
	const trailingParamMatch = routePath.match(/\/\$([a-zA-Z0-9_]+)$/)
	const detailNeedsIdSuffix = isDetail && !trailingParamMatch
	const detailParamName = isDetail ? (trailingParamMatch ? trailingParamMatch[1] : 'id') : ''

	const wantsExportParams = (readBool(flags, 'export-params-type') ?? true) && !isDetail
	const exportItemTypeFlag = flags['export-item-type']
	const explicitImports = parseImports(readValue(flags, 'import'))

	// Build the schema body (skipped under --detail).
	let hoistedImports: string[] = []
	let schemaBody: string | undefined
	if (!isDetail && (extend || searchValue || searchFile)) {
		if (searchFile) {
			const file = await readSearchFile(searchFile)
			hoistedImports = file.imports
			// Re-indent the hoisted body so it sits inside the `z.object({...})`
			// wrapper at the correct tab depth (two extra tabs vs the source file).
			schemaBody = file.zodBody
				.split('\n')
				.map(line => (line.trim() ? `\t\t${line.replace(/^\t/, '')}` : line))
				.join('\n')
		} else if (searchValue) {
			const fields = parseSearchSpec(searchValue)
			schemaBody = fields.map(f => `\t\t${f.name}: ${renderField(f)},`).join('\n')
		}
	}

	// --- Imports ---
	const importLines: string[] = [
		`import { createFileRoute } from '@tanstack/react-router'`,
		`import { z } from 'zod'`,
		`import { RouteError } from '@/components/RouteError'`,
	]
	for (const imp of explicitImports) {
		importLines.push(`import { ${imp.symbols.join(', ')} } from '${imp.from}'`)
	}
	for (const line of hoistedImports) {
		if (!importLines.includes(line)) importLines.push(line)
	}
	// SDK imports — different per detail / list route.
	// Naive English pluralization (`+ 's'` unless already ending in 's') is enough
	// for typical entities; the user fixes irregular plurals (Person → People) after.
	const sdkPlural = sdk && (sdk.endsWith('s') ? sdk : `${sdk}s`)
	const sdkSymbols: string[] = []
	if (extend && !isDetail) sdkSymbols.push(extend)
	if (sdk && !isDetail && exportItemTypeFlag !== undefined) {
		sdkSymbols.push(`type List${sdkPlural}QueryResponse`)
	}
	if (sdk && isDetail) sdkSymbols.push(`type Get${sdk}QueryResponse`)
	// --- Loader (prefetch canon — spec 2026-07-09-frontend-data-loading-canon) ---
	const loaderFlag = flags.loader
	let loaderLines = ''
	if (loaderFlag !== undefined) {
		let queryOptionsName: string
		if (loaderFlag !== 'true') {
			queryOptionsName = loaderFlag
		} else if (!isDetail && extend?.endsWith('QueryParamsSchema')) {
			queryOptionsName = `${extend.slice(0, -'QueryParamsSchema'.length)}QueryOptions`
		} else {
			console.error(
				isDetail
					? 'route: --detail --loader exige valor explícito (--loader=<queryOptionsName>) — não há --extend para derivar'
					: 'route: --loader precisa de --extend=<...QueryParamsSchema> para derivar, ou passe --loader=<queryOptionsName>',
			)
			process.exit(1)
		}
		sdkSymbols.push(queryOptionsName)
		if (isDetail) {
			loaderLines = `\tloader: async ({ context, params }) => {\n\t\tawait context.queryClient\n\t\t\t.ensureQueryData(${queryOptionsName}({ ${detailParamName}: params.${detailParamName} }))\n\t\t\t.catch(() => null)\n\t},\n`
		} else {
			loaderLines = `\tloaderDeps: ({ search }) => search,\n\tloader: async ({ context, deps }) => {\n\t\tawait context.queryClient.ensureQueryData(${queryOptionsName}({ params: deps })).catch(() => null)\n\t},\n`
		}
	}

	if (sdkSymbols.length) {
		importLines.push(`import {\n\t${sdkSymbols.join(',\n\t')},\n} from '${REPO.sdkSpecifier}'`)
	}
	importLines.push(`import { zodValidator } from '@/lib/zod-validator'`)
	importLines.push(`import { useTranslation } from 'react-i18next'`)
	importLines.push(`import i18n from '@/lib/i18n'`)

	// --- Type exports ---
	let itemTypeExport = ''
	if (!isDetail && exportItemTypeFlag !== undefined && sdk) {
		const typeName = exportItemTypeFlag === 'true' ? `${routePascal}Item` : exportItemTypeFlag
		itemTypeExport = `\nexport type ${typeName} = List${sdkPlural}QueryResponse['items'][number]\n`
	}

	// --- Schema declaration ---
	let schemaDecl = ''
	let validateSearchLine = ''
	if (!isDetail && (extend || schemaBody !== undefined)) {
		const inner = schemaBody !== undefined ? `z.object({\n${schemaBody}\n\t})` : `z.object({})`
		if (extend) {
			schemaDecl = `\nconst ${routeCamel}SearchSchema = ${extend}.and(\n\t${inner},\n)\n`
		} else {
			schemaDecl = `\nconst ${routeCamel}SearchSchema = ${inner}\n`
		}
		validateSearchLine = `\tvalidateSearch: zodValidator(${routeCamel}SearchSchema),\n`
	}

	let paramsTypeExport = ''
	if (wantsExportParams && (extend || schemaBody !== undefined)) {
		paramsTypeExport = `\nexport type ${routePascal}SearchParams = z.infer<typeof ${routeCamel}SearchSchema>\n`
	}

	// --- Route export ---
	// Detail routes already end with their `$param` (e.g. `(app)/patients/$patientId`),
	// so we don't append `/$id` unless the user's path has no trailing param.
	const fsPath = detailNeedsIdSuffix ? `${routePath}/$id` : routePath
	const routeStaticPath = `/${fsPath}/`

	const routeExport = `
export const Route = createFileRoute('${routeStaticPath}')({
\tstaticData: { breadcrumb: i18n.t('nav.${navKey}') },
${validateSearchLine}${loaderLines}\terrorComponent: RouteError,
\tcomponent: RouteComponent,
})
`

	// --- Component body ---
	const detailParamLine = isDetail ? `\tconst { ${detailParamName} } = Route.useParams()\n` : ''
	const layoutOpenTag =
		layout === 'app'
			? `<div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8 flex flex-col gap-6">`
			: `<main className="p-6">`
	const layoutCloseTag = layout === 'app' ? `</div>` : `</main>`

	const componentFn = `
function RouteComponent() {
\tconst { t } = useTranslation()
${detailParamLine}
\treturn (
\t\t${layoutOpenTag}
\t\t\t<header className="flex items-center justify-between">
\t\t\t\t<div>
\t\t\t\t\t<h1 className="text-2xl font-bold text-foreground">{t('${i18nPrefix}.title')}</h1>
\t\t\t\t\t<p className="text-sm text-muted-foreground">{t('${i18nPrefix}.subtitle')}</p>
\t\t\t\t</div>
\t\t\t</header>
\t\t\t{/* Implement page */}
\t\t${layoutCloseTag}
\t)
}
`

	const content = `${importLines.join('\n')}\n${itemTypeExport}${schemaDecl}${paramsTypeExport}${routeExport}${componentFn}`

	// Auto-trigger i18n writer with the slots we just referenced.
	if (flags['no-i18n-write'] !== 'true' && flags.print !== 'true') {
		await writeI18n({ namespace: 'nav', keys: [navKey] })
		await writeI18n({ namespace: i18nPrefix, keys: ['title', 'subtitle'] })
	}

	return [
		{
			filePath: `packages/app/react/src/routes/${fsPath}/index.tsx`,
			content,
		},
	]
}
