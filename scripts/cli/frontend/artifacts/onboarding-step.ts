// `bun cli onboarding-step <Name>` (spec §5.5).
//
// Matches the canonical step shape at routes/onboarding/-components/<Name>Step/:
//   - SDK schema slice (from `--from`, optionally narrowed by `--fields`)
//   - exports `<Name>StepSchema` + `<Name>StepData` type
//   - props: defaultValues?, onSubmit, onBack?, isSubmitting?
//   - back/next buttons + i18n
//   - optional Maskito masks per field

import { REPO } from '../../../../template.config'
import type { Generator } from '../../types'
import { writeI18n } from './i18n'
import { toCamelCase, toPascalCase, withSuffix } from '../util/naming'
import { parseCsv, parseKvSpec, readValue, requireValue } from '../util/flags'

export const onboardingStepGenerator: Generator = async (pos, flags) => {
	const [rawName] = pos
	if (!rawName) {
		console.error(
			[
				'onboarding-step <Name> --from=<sdk.path> --i18n=<prefix> (--fields=<csv> | --all-fields)',
				'    [--mask=<spec>]                       semicolon-separated field=maskName pairs',
			].join('\n'),
		)
		process.exit(1)
	}

	const i18nPrefix = requireValue(flags, 'i18n', 'onboarding-step')
	const from = requireValue(flags, 'from', 'onboarding-step')
	const fields = parseCsv(readValue(flags, 'fields'))
	const allFields = flags['all-fields'] === 'true'
	if ((fields.length && allFields) || (!fields.length && !allFields)) {
		console.error('[onboarding-step] exactly one of --fields / --all-fields is required')
		process.exit(1)
	}
	const masks = parseKvSpec(readValue(flags, 'mask'))

	const stepFolder = withSuffix(rawName, 'Step')
	const pascal = toPascalCase(stepFolder)
	const baseCamel = toCamelCase(rawName.replace(/Step$/, ''))
	const schemaName = `${pascal}Schema`
	const dataType = `${pascal}Data`

	const fromRoot = from.split('.')[0]

	const pickClause = allFields
		? '\n// TODO: confirm field set — using full schema'
		: `.pick({ ${fields.map(f => `${f}: true`).join(', ')} })`

	const sourceLine = `const ${baseCamel}Schema = ${from}`
	const exportLine = allFields
		? `export const ${schemaName} = ${baseCamel}Schema${pickClause}`
		: `export const ${schemaName} = ${baseCamel}Schema${pickClause}`

	// Mask wiring: import unique mask names, create useMaskito refs per field.
	const uniqueMaskNames = [...new Set(masks.values())]
	const maskImportLines = uniqueMaskNames.length
		? [
				`import { useMaskito } from '@maskito/react'`,
				`import { ${uniqueMaskNames.map(m => `${m}MaskOptions`).join(', ')} } from '@/lib/masks'`,
			]
		: []
	const maskRefLines = [...masks.entries()].map(([field, mask]) => `\tconst ${field}InputRef = useMaskito({ options: ${mask}MaskOptions })`)

	const content = `import { useForm } from '@tanstack/react-form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel, FieldError, FieldGroup } from '@/components/ui/field'
import { type DeepPartial } from '@/lib'
import { ${fromRoot} } from '${REPO.sdkSpecifier}'
${maskImportLines.join('\n')}${maskImportLines.length ? '\n' : ''}import { IconArrowRight, IconArrowLeft } from '@tabler/icons-react'
import { Spinner } from '@/components/ui/spinner'
import { useTranslation } from 'react-i18next'

${sourceLine}
${exportLine}

type ${dataType} = (typeof ${schemaName})['_zod']['output']

interface ${pascal}Props {
\tdefaultValues?: DeepPartial<${dataType}>
\tonSubmit: (data: ${dataType}) => void
\tonBack?: () => void
\tisSubmitting?: boolean
}

export function ${pascal}({ defaultValues, onSubmit, onBack, isSubmitting }: ${pascal}Props) {
\tconst { t } = useTranslation()
${maskRefLines.join('\n')}${maskRefLines.length ? '\n' : ''}
\tconst form = useForm({
\t\tdefaultValues,
\t\tonSubmit: async form => {
\t\t\tconst result = ${schemaName}.safeParse(form.value)
\t\t\tif (!result.success) return
\t\t\tonSubmit(result.data)
\t\t},
\t})

\treturn (
\t\t<form
\t\t\tonSubmit={e => {
\t\t\t\te.preventDefault()
\t\t\t\te.stopPropagation()
\t\t\t\tform.handleSubmit()
\t\t\t}}
\t\t\tclassName="flex flex-col gap-6 p-2"
\t\t>
\t\t\t<div className="text-center">
\t\t\t\t<h2 className="text-2xl font-semibold tracking-tight">{t('${i18nPrefix}.title')}</h2>
\t\t\t\t<p className="text-muted-foreground mt-2">{t('${i18nPrefix}.subtitle')}</p>
\t\t\t</div>

\t\t\t<FieldGroup>
\t\t\t\t{/* TODO: render <form.Field> for each picked field */}
\t\t\t</FieldGroup>

\t\t\t<form.Subscribe selector={state => ({ canSubmit: state.canSubmit, values: state.values })}>
\t\t\t\t{({ canSubmit, values }) => {
\t\t\t\t\tconst isDisabled = isSubmitting || !canSubmit || !${schemaName}.safeParse(values).success
\t\t\t\t\treturn (
\t\t\t\t\t\t<div className="flex justify-between">
\t\t\t\t\t\t\t<div>
\t\t\t\t\t\t\t\t{onBack && (
\t\t\t\t\t\t\t\t\t<Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>
\t\t\t\t\t\t\t\t\t\t<IconArrowLeft className="mr-1 size-4" />
\t\t\t\t\t\t\t\t\t\t{t('common.back')}
\t\t\t\t\t\t\t\t\t</Button>
\t\t\t\t\t\t\t\t)}
\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t<div className="flex gap-2">
\t\t\t\t\t\t\t\t<Button type="submit" disabled={isDisabled}>
\t\t\t\t\t\t\t\t\t{isSubmitting && <Spinner className="mr-2" />}
\t\t\t\t\t\t\t\t\t{t('common.next')}
\t\t\t\t\t\t\t\t\t<IconArrowRight className="ml-1 size-4" />
\t\t\t\t\t\t\t\t</Button>
\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t</div>
\t\t\t\t\t)
\t\t\t\t}}
\t\t\t</form.Subscribe>
\t\t</form>
\t)
}

export type { ${dataType} }
`

	if (flags['no-i18n-write'] !== 'true' && flags.print !== 'true') {
		await writeI18n({ namespace: i18nPrefix, keys: ['title', 'subtitle'] })
	}

	return [
		{
			filePath: `packages/app/react/src/routes/onboarding/-components/${pascal}/index.tsx`,
			content,
		},
	]
}
