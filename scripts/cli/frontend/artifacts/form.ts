// `bun cli form <route> <Name>` — enriched form scaffolder (spec §5.4).
//
// Flags:
//   --from=<SDKSchemaName[.dot.path]>   Slice an SDK Zod schema
//   --fields=<spec>                     Alternative inline schema (name:text,email:email,role:select,birthdate:date)
//   --edit                              defaultValues prop (no fresh-build)
//   --mutation=<hookName>               Optional — SDK mutation; absent → parent-controlled onSubmit
//   --i18n=<prefix>                     Required (FieldLabels, placeholders, submit button all use t())

import { REPO } from '../../../../template.config'
import type { Generator } from '../../types'
import { writeI18n } from './i18n'
import { toCamelCase, toPascalCase, withSuffix } from '../util/naming'
import { parseCsv, readValue, requireValue } from '../util/flags'

interface FieldSpec {
	name: string
	type: 'text' | 'email' | 'select' | 'date' | 'number' | 'textarea'
}

function parseFieldsSpec(value: string | undefined): FieldSpec[] {
	if (!value) return []
	return parseCsv(value).map(entry => {
		const [name, type = 'text'] = entry.split(':').map(s => s.trim())
		return { name, type: type as FieldSpec['type'] }
	})
}

function fieldZod(spec: FieldSpec): string {
	switch (spec.type) {
		case 'email':
			return `z.string().email()`
		case 'date':
			return `z.coerce.date()`
		case 'number':
			return `z.number()`
		default:
			return `z.string().min(1)`
	}
}

// Walk a `--from` dotted path. We don't introspect — we just emit the access
// chain plus a chained `.pick({})` placeholder if the user wants to narrow.
function renderSdkSliceImport(from: string): { rootSymbol: string; sliceExpr: string } {
	const rootSymbol = from.split('.')[0]
	return { rootSymbol, sliceExpr: from }
}

export const formGenerator: Generator = async (pos, flags) => {
	const [routePath, rawName] = pos
	if (!routePath || !rawName) {
		console.error(
			[
				'form <route> <Name> --i18n=<prefix>',
				'  Exactly one of:',
				'    --from=<SDKSchemaName[.dot.path]>   slice an SDK Zod schema',
				'    --fields=<spec>                     inline z.object (name:text,email:email,...)',
				'  Optional:',
				'    --edit                              edit-mode shape (defaultValues prop)',
				'    --mutation=<hookName>               SDK mutation hook (else parent-controlled onSubmit)',
			].join('\n'),
		)
		process.exit(1)
	}

	const i18nPrefix = requireValue(flags, 'i18n', 'form')
	const from = readValue(flags, 'from')
	const fieldsRaw = readValue(flags, 'fields')
	const isEdit = flags.edit === 'true'
	const mutation = readValue(flags, 'mutation')

	if (!from && !fieldsRaw) {
		console.error('[form] one of --from / --fields is required')
		process.exit(1)
	}
	if (from && fieldsRaw) {
		console.error('[form] --from and --fields are mutually exclusive')
		process.exit(1)
	}

	const folderName = withSuffix(rawName, 'Form')
	const pascal = toPascalCase(folderName)
	const baseCamel = toCamelCase(rawName.replace(/Form$/, ''))
	const schemaName = `${baseCamel}Schema`
	const inputType = `${pascal}Input`

	const fields = parseFieldsSpec(fieldsRaw)

	// Schema declaration
	let schemaDecl: string
	let schemaImport = ''
	if (from) {
		const { rootSymbol, sliceExpr } = renderSdkSliceImport(from)
		schemaImport = `\nimport { ${rootSymbol} } from '${REPO.sdkSpecifier}'`
		schemaDecl = `const ${schemaName} = ${sliceExpr}`
	} else {
		const lines = fields.map(f => `\t${f.name}: ${fieldZod(f)},`).join('\n')
		schemaDecl = `const ${schemaName} = z.object({\n${lines}\n})`
	}

	// Mutation wiring (optional)
	const mutationCamel = mutation ? toCamelCase(mutation.replace(/^use/, '')) : ''
	const mutationImport = mutation ? `\nimport { ${mutation} } from '${REPO.sdkSpecifier}'` : ''
	const mutationHook = mutation ? `\n\tconst ${mutationCamel} = ${mutation}()` : ''

	const onSubmitBody = mutation
		? `\t\t\tawait ${mutationCamel}.mutateAsync(
\t\t\t\t{ data: result.data },
\t\t\t\t{
\t\t\t\t\tonSuccess: () => {
\t\t\t\t\t\ttoast.success(t('${i18nPrefix}.success'))
\t\t\t\t\t\tonSuccess?.()
\t\t\t\t\t},
\t\t\t\t},
\t\t\t)`
		: `\t\t\tawait onSubmit(result.data)`

	const propsInterface = mutation
		? `interface ${pascal}Props {
\t${isEdit ? `defaultValues: ${inputType}\n\t` : ''}onSuccess?: () => void
}`
		: `interface ${pascal}Props {
\t${isEdit ? `defaultValues: ${inputType}\n\t` : ''}onSubmit: (data: ${inputType}) => void | Promise<void>
}`

	const propsDestructure = mutation
		? isEdit
			? `({ defaultValues, onSuccess }: ${pascal}Props)`
			: `({ onSuccess }: ${pascal}Props)`
		: isEdit
			? `({ defaultValues, onSubmit }: ${pascal}Props)`
			: `({ onSubmit }: ${pascal}Props)`

	const defaultValuesDecl = isEdit
		? `\t// defaultValues comes from props`
		: from
			? `\tconst defaultValues: Partial<${inputType}> = {\n\t\t// TODO: initial values\n\t}`
			: `\tconst defaultValues: ${inputType} = {\n${fields.map(f => `\t\t${f.name}: ${defaultFor(f)},`).join('\n')}\n\t}`

	// Render form fields list
	const fieldNames = fields.length ? fields.map(f => f.name) : ['/* TODO: render fields */']
	const fieldRender = fields.length
		? fields.map(f => renderFieldJsx(f, i18nPrefix)).join('\n\n')
		: `\t\t\t\t{/* TODO: render fields via <form.Field> */}`

	const toastImport = mutation ? `\nimport { toast } from 'sonner'` : ''

	// Submit button block — includes mutation.isPending in the disabled guard
	// when a mutation is wired (canonical pattern).
	const submitBlock = mutation
		? `\t\t\t<form.Subscribe selector={s => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting })}>
\t\t\t\t{({ canSubmit, isSubmitting }) => (
\t\t\t\t\t<Button type="submit" disabled={!canSubmit || isSubmitting || ${mutationCamel}.isPending}>
\t\t\t\t\t\t{(isSubmitting || ${mutationCamel}.isPending) && <Spinner className="mr-2" />}
\t\t\t\t\t\t{t('${i18nPrefix}.submit')}
\t\t\t\t\t</Button>
\t\t\t\t)}
\t\t\t</form.Subscribe>`
		: `\t\t\t<form.Subscribe selector={s => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting })}>
\t\t\t\t{({ canSubmit, isSubmitting }) => (
\t\t\t\t\t<Button type="submit" disabled={!canSubmit || isSubmitting}>
\t\t\t\t\t\t{isSubmitting && <Spinner className="mr-2" />}
\t\t\t\t\t\t{t('${i18nPrefix}.submit')}
\t\t\t\t\t</Button>
\t\t\t\t)}
\t\t\t</form.Subscribe>`

	const content = `import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useTranslation } from 'react-i18next'${schemaImport}${mutationImport}${toastImport}

${schemaDecl}

type ${inputType} = z.infer<typeof ${schemaName}>

${propsInterface}

export function ${pascal}${propsDestructure} {
\tconst { t } = useTranslation()${mutationHook}
${defaultValuesDecl}

\tconst form = useForm({
\t\tdefaultValues,
\t\tvalidators: { onChange: ${schemaName} },
\t\tonSubmit: async ({ value }) => {
\t\t\tconst result = ${schemaName}.safeParse(value)
\t\t\tif (!result.success) return
${onSubmitBody}
\t\t},
\t})

\treturn (
\t\t<form
\t\t\tonSubmit={e => {
\t\t\t\te.preventDefault()
\t\t\t\te.stopPropagation()
\t\t\t\tform.handleSubmit()
\t\t\t}}
\t\t>
\t\t\t<FieldGroup>
${fieldRender}
\t\t\t</FieldGroup>

${submitBlock}
\t\t</form>
\t)
}
`

	// Auto-trigger i18n writer.
	if (flags['no-i18n-write'] !== 'true' && flags.print !== 'true') {
		const slots = ['submit', ...fields.map(f => `fields.${f.name}.label`), ...fields.map(f => `fields.${f.name}.placeholder`)]
		if (mutation) slots.push('success')
		await writeI18n({ namespace: i18nPrefix, keys: slots })
	}

	return [
		{
			filePath: `packages/app/react/src/routes/${routePath}/-components/${pascal}/index.tsx`,
			content,
		},
	]
}

function defaultFor(spec: FieldSpec): string {
	switch (spec.type) {
		case 'number':
			return '0'
		case 'date':
			return 'new Date()'
		default:
			return `''`
	}
}

function renderFieldJsx(spec: FieldSpec, i18nPrefix: string): string {
	const isTextarea = spec.type === 'textarea'
	const inputTag = isTextarea ? 'Textarea' : 'Input'
	return `\t\t\t\t<form.Field name="${spec.name}">
\t\t\t\t\t{field => {
\t\t\t\t\t\tconst isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
\t\t\t\t\t\treturn (
\t\t\t\t\t\t\t<Field>
\t\t\t\t\t\t\t\t<FieldLabel htmlFor={field.name}>{t('${i18nPrefix}.fields.${spec.name}.label')}</FieldLabel>
\t\t\t\t\t\t\t\t<${inputTag}
\t\t\t\t\t\t\t\t\tid={field.name}
\t\t\t\t\t\t\t\t\tname={field.name}
\t\t\t\t\t\t\t\t\tvalue={field.state.value ?? ''}
\t\t\t\t\t\t\t\t\tonBlur={field.handleBlur}
\t\t\t\t\t\t\t\t\tonChange={e => field.handleChange(e.target.value)}
\t\t\t\t\t\t\t\t\taria-invalid={isInvalid}
\t\t\t\t\t\t\t\t\tplaceholder={t('${i18nPrefix}.fields.${spec.name}.placeholder')}
\t\t\t\t\t\t\t\t/>
\t\t\t\t\t\t\t\t{isInvalid && <FieldError errors={field.state.meta.errors} />}
\t\t\t\t\t\t\t</Field>
\t\t\t\t\t\t)
\t\t\t\t\t}}
\t\t\t\t</form.Field>`
}
