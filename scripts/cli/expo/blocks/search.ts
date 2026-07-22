// Mobile search-params block — emits the inline Zod schema + the
// `useTypedSearchParams(schema)` hook call that's the mobile equivalent of
// the web `validateSearch: zodValidator(schema)` contract.
//
// Two composition modes:
//   - Pure micro-DSL fields → `z.object({ ... })`
//   - With `--sdk=<SchemaName>` → `<SchemaName>.and(z.object({ ... }))` so the
//     route inherits validated server-side params and layers UI-only ones on
//     top, matching the web `--extend=<SDKSchemaName>` story.

import { parseSearchSpec, renderField } from '../util/search-dsl'
import { MOBILE_SDK_PACKAGE } from './sdk'
import type { MobileBlockOutput } from './types'

export interface SearchBlockOptions {
	camel: string
	spec?: string
	sdkSchema?: string
}

export function searchBlock(opts: SearchBlockOptions): MobileBlockOutput {
	const { camel, spec, sdkSchema } = opts
	if (!spec && !sdkSchema) return {}

	const imports: string[] = [`import { z } from 'zod'`, `import { useTypedSearchParams } from '@/lib/typed-route'`]
	if (sdkSchema) imports.push(`import { ${sdkSchema} } from '${MOBILE_SDK_PACKAGE}'`)

	const fields = spec ? parseSearchSpec(spec) : []
	const objectBody = fields.length ? `z.object({\n${fields.map(f => `\t${f.name}: ${renderField(f)},`).join('\n')}\n})` : `z.object({})`
	const schemaExpr = sdkSchema ? `${sdkSchema}.and(\n\t${objectBody},\n)` : objectBody
	const decl = `const ${camel}SearchSchema = ${schemaExpr}`

	return {
		imports,
		declarations: [decl],
		hookCalls: [`const [params, setParams] = useTypedSearchParams(${camel}SearchSchema)`],
	}
}
