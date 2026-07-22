// `bun cli sheet <name>` (mobile-only) — scaffolds an Expo Router `(sheets)`
// group route. The sheet IS the modal: opening it via
// `router.push('/(sheets)/<name>')` presents the configured presentation;
// closing it via `router.back()` / `router.dismiss()` dismisses it.
//
// Shape and snippets are sourced from berzerk-club/feat/training-collaboration's
// real (sheets) routes:
//   - pageSheet / formSheet inner _layout.tsx is a bare `<Slot />` (matches
//     berzerk devices/, notifications/, feed-visibility-settings/, …). All
//     sheet* presentation options live on the ROOT app/_layout.tsx Stack.Screen
//     entry — putting them on the inner Stack is registry bp-09.
//   - fullScreenModal inner _layout.tsx is a `<Stack>` with a back-arrow header
//     (matches berzerk edit-profile/_layout.tsx), because iOS doesn't render a
//     header for fullScreenModal by default.
//
// Flags:
//   --i18n=<prefix>             Required. Drives header title + body slots.
//   --presentation=<pageSheet|formSheet|fullScreenModal>
//                                Default `pageSheet`. Selects the layout shape
//                                (slot vs back-arrow stack). Note: actual
//                                sheet* options must be registered on the root
//                                app/_layout.tsx, not the inner layout.
//   --form                       Scaffold a TanStack-Form body wrapped in
//                                `<KeyboardAware>` with a submit `Button`.
//   --sdk=<SchemaName>           Used by `--form` as the validator schema.
//   --multistep                  Emit `index.tsx` + `step-2.tsx` + a shared
//                                Zustand store at `-stores/<name>-store.ts`.

import type { Generator, GeneratedFile } from '../../types'
import { renderArtifact } from '../../snippet/render'
import { readValue, requireValue } from '../util/flags'
import { toKebabCase, toPascalCase } from '../util/naming'
import { MOBILE_SDK_PACKAGE } from '../blocks'

type Presentation = 'pageSheet' | 'formSheet' | 'fullScreenModal'

const PRESENTATIONS: ReadonlySet<Presentation> = new Set(['pageSheet', 'formSheet', 'fullScreenModal'])

export const sheetGenerator: Generator = (pos, flags) => {
	const [rawName] = pos
	if (!rawName) {
		console.error(
			[
				'sheet <name> --i18n=<prefix>',
				'    [--presentation=<pageSheet|formSheet|fullScreenModal>]',
				'    [--form] [--sdk=<SchemaName>]',
				'    [--multistep]',
			].join('\n'),
		)
		process.exit(1)
	}

	const i18nPrefix = requireValue(flags, 'i18n', 'sheet')
	const presentation = (readValue(flags, 'presentation') ?? 'pageSheet') as Presentation
	if (!PRESENTATIONS.has(presentation)) {
		console.error(`[sheet] unknown --presentation="${presentation}". Use one of pageSheet | formSheet | fullScreenModal.`)
		process.exit(1)
	}
	const isForm = flags.form === 'true'
	const isMultistep = flags.multistep === 'true'
	const sdkSchema = readValue(flags, 'sdk')

	const kebab = toKebabCase(rawName)
	const pascal = toPascalCase(rawName)
	const base = `packages/app/expo/app/(sheets)/${kebab}`

	const files: GeneratedFile[] = []

	// --- Layout ---
	// fullScreenModal needs an inner Stack with a back arrow (iOS doesn't
	// render one by default for fullScreenModal); pageSheet / formSheet use
	// a bare <Slot /> so the root app/_layout.tsx owns presentation options.
	const layoutContent =
		presentation === 'fullScreenModal'
			? renderArtifact('sheet', 'expo', {
					_variant: 'layout-stack',
					Pascal: pascal,
					i18nPrefix,
				})
			: renderArtifact('sheet', 'expo', {
					_variant: 'layout-slot',
					Pascal: pascal,
				})
	files.push({ filePath: `${base}/_layout.tsx`, content: layoutContent })

	// --- Body (or step bodies + store) ---
	if (isMultistep) {
		// Step 1 lives at index.tsx so the route is /(sheets)/<name>; step 2
		// at step-2.tsx (the registry SHT-C06 wants step-N siblings, not
		// separate top-level routes).
		files.push({
			filePath: `${base}/index.tsx`,
			content: renderArtifact('sheet', 'expo', {
				_variant: 'body-step',
				Pascal: pascal,
				step: '1',
				nextStep: '2',
				kebab,
				i18nPrefix,
			}),
		})
		files.push({
			filePath: `${base}/step-2.tsx`,
			content: renderArtifact('sheet', 'expo', {
				_variant: 'body-step',
				Pascal: pascal,
				step: '2',
				nextStep: '3',
				kebab,
				i18nPrefix,
			}),
		})
		files.push({
			filePath: `${base}/-stores/${kebab}-store.ts`,
			content: renderArtifact('sheet', 'expo', {
				_variant: 'store',
				Pascal: pascal,
			}),
		})
	} else if (isForm) {
		// SDK schema feeds the validator + input type. Without --sdk, the
		// generated form ships TODO scaffolding and a generic input type.
		const sdkImportLine = sdkSchema
			? `\nimport { ${sdkSchema} } from '${MOBILE_SDK_PACKAGE}'\nimport type { DeepPartial } from '@/lib/types'`
			: `\nimport type { DeepPartial } from '@/lib/types'`
		const inputType = sdkSchema ? `typeof ${sdkSchema}['_output']` : 'Record<string, unknown>'
		const validator = sdkSchema ?? 'undefined'
		const safeParseBlock = sdkSchema
			? `const result = ${sdkSchema}.safeParse(value)
			if (!result.success) return`
			: `// TODO: validate \`value\` against the SDK schema before submitting.`
		files.push({
			filePath: `${base}/index.tsx`,
			content: renderArtifact('sheet', 'expo', {
				_variant: 'body-form',
				Pascal: pascal,
				i18nPrefix,
				sdkImportLine,
				inputType,
				validator,
				safeParseBlock,
			}),
		})
	} else {
		files.push({
			filePath: `${base}/index.tsx`,
			content: renderArtifact('sheet', 'expo', {
				// default skeleton is body-plain — no _variant needed.
				Pascal: pascal,
				i18nPrefix,
			}),
		})
	}

	return files
}
