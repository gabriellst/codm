// `bun cli dialog <route> <Name> --crud=create|update|delete|confirm` (spec §5.3).
//
// Self-contained dialog opened via `useDialogStore.show(<Dialog />)`. No `open`
// or `onOpenChange` props — lives entirely in the global dialog store.
//
// Shapes:
//   create / update : <DialogContent> + useForm + SDK mutation + invalidate + toast + hide()
//   delete          : <AlertDialog> calling --mutation (typical: deletePatient)
//   confirm         : <AlertDialog> resolving useDialogStore.confirm() Promise

import { REPO } from '../../../../template.config'
import type { Generator } from '../../types'
import { writeI18n } from './i18n'
import { toCamelCase, toPascalCase, withSuffix } from '../util/naming'
import { parseCsv, readValue, requireValue } from '../util/flags'

type Crud = 'create' | 'update' | 'delete' | 'confirm'

const CRUD_VALUES: Crud[] = ['create', 'update', 'delete', 'confirm']

export const dialogGenerator: Generator = async (pos, flags) => {
	const [routePath, rawName] = pos
	if (!routePath || !rawName) {
		console.error(
			[
				'dialog <route> <Name> --crud=create|update|delete|confirm --i18n=<prefix>',
				'    [--sdk=<Identifier>]                  required for --crud=create|update',
				'    [--mutation=<hookName>]               required for --crud=create|update',
				'    [--invalidate=<csv>]                  SDK query-key hooks to invalidate',
				'',
				'  delete   uses <AlertDialog>; pass --mutation for the action.',
				'  confirm  is the bare confirm wrapper (resolves useDialogStore.confirm()).',
			].join('\n'),
		)
		process.exit(1)
	}

	const crud = requireValue(flags, 'crud', 'dialog') as Crud
	if (!CRUD_VALUES.includes(crud)) {
		console.error(`[dialog] --crud must be one of ${CRUD_VALUES.join(', ')} (got "${crud}")`)
		process.exit(1)
	}
	const i18nPrefix = requireValue(flags, 'i18n', 'dialog')
	const sdk = readValue(flags, 'sdk')
	const mutation = readValue(flags, 'mutation')
	const invalidate = parseCsv(readValue(flags, 'invalidate'))

	if ((crud === 'create' || crud === 'update') && (!sdk || !mutation)) {
		console.error(`[dialog] --sdk and --mutation are required when --crud=${crud}`)
		process.exit(1)
	}

	const folderName = withSuffix(rawName, 'Dialog')
	const pascal = toPascalCase(folderName)

	let content: string
	let slots: string[]
	switch (crud) {
		case 'create':
		case 'update':
			content = buildCrudFormDialog({ crud, pascal, sdk: sdk!, mutation: mutation!, invalidate, i18nPrefix })
			slots = ['title', 'description', 'submit', 'cancel', 'success']
			break
		case 'delete':
			content = buildDeleteDialog({ pascal, mutation, invalidate, i18nPrefix })
			slots = ['title', 'description', 'confirm', 'cancel', 'deleting', 'success']
			break
		case 'confirm':
			content = buildConfirmDialog({ pascal, i18nPrefix })
			slots = ['title', 'description', 'confirm', 'cancel']
			break
	}

	if (flags['no-i18n-write'] !== 'true' && flags.print !== 'true') {
		await writeI18n({ namespace: i18nPrefix, keys: slots })
	}

	return [
		{
			filePath: `packages/app/react/src/routes/${routePath}/-components/${pascal}/index.tsx`,
			content,
		},
	]
}

// -----------------------------------------------------------------------------
// Shape 1: create | update — form dialog
// -----------------------------------------------------------------------------

function buildCrudFormDialog(args: {
	crud: 'create' | 'update'
	pascal: string
	sdk: string
	mutation: string
	invalidate: string[]
	i18nPrefix: string
}): string {
	const { crud, pascal, sdk, mutation, invalidate, i18nPrefix } = args
	const mutationCamel = toCamelCase(mutation.replace(/^use/, ''))
	const verbPascal = crud === 'create' ? 'Create' : 'Update'
	const schemaName = `${verbPascal.toLowerCase()}${sdk}MutationRequestSchema`
	const requestType = `${verbPascal}${sdk}MutationRequest`

	const invalidationLines = invalidate.length
		? invalidate
				.map(h => {
					// `useListFoo` → `listFooQueryKey`
					const keyFn = `${h.replace(/^use/, '').charAt(0).toLowerCase() + h.replace(/^use/, '').slice(1)}QueryKey`
					return `\t\t\t\t\t\tawait queryClient.invalidateQueries({ queryKey: ${keyFn}() })`
				})
				.join('\n')
		: '\t\t\t\t\t\t// no invalidation'

	const invalidateImports = invalidate
		.map(h => `${h.replace(/^use/, '').charAt(0).toLowerCase() + h.replace(/^use/, '').slice(1)}QueryKey`)
		.join(',\n\t')
	const queryKeyImportBlock = invalidate.length ? `\n\t${invalidateImports},` : ''

	const props = crud === 'update' ? `interface ${pascal}Props {\n\tdefaultValues: ${requestType}\n}` : `interface ${pascal}Props {}`
	const propsDestructure = crud === 'update' ? `({ defaultValues }: ${pascal}Props)` : `()`
	const defaultValuesDecl =
		crud === 'update'
			? `// defaultValues comes from props`
			: `const defaultValues: DeepPartial<${requestType}> = {\n\t\t// TODO: initial values\n\t}`

	return `import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from '@codm/app-ui/dialog'
import { Button } from '@codm/app-ui/button'
import { Field, FieldLabel, FieldError, FieldGroup } from '@codm/app-ui/field'
import { Input } from '@codm/app-ui/input'
import { Spinner } from '@codm/app-ui/spinner'
import {
	${mutation},
	${schemaName},
	type ${requestType},${queryKeyImportBlock}
} from '${REPO.sdkSpecifier}'
import { DeepPartial } from '@/lib'
import { useDialogStore } from '@/stores/useDialogStore'
import { useTranslation } from 'react-i18next'

${props}

export function ${pascal}${propsDestructure} {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const ${mutationCamel} = ${mutation}()
	const { hide } = useDialogStore()

	${defaultValuesDecl}

	const form = useForm({
		defaultValues,
		validators: { onChange: ${schemaName} },
		onSubmit: async form => {
			const result = ${schemaName}.safeParse(form.value)
			if (!result.success) return

			await ${mutationCamel}.mutateAsync(
				{ data: result.data },
				{
					onSuccess: () => {
						toast.success(t('${i18nPrefix}.success'))
						hide()
					},
					onSettled: async () => {
${invalidationLines}
					},
				},
			)
		},
	})

	return (
		<DialogContent>
			<DialogHeader>
				<DialogTitle>{t('${i18nPrefix}.title')}</DialogTitle>
				<DialogDescription>{t('${i18nPrefix}.description')}</DialogDescription>
			</DialogHeader>

			<form
				noValidate
				onSubmit={e => {
					e.preventDefault()
					e.stopPropagation()
					form.handleSubmit()
				}}
			>
				<FieldGroup>
					{/* TODO: render fields via form.Field */}
				</FieldGroup>

				<DialogFooter className="mt-6">
					<Button variant="outline" type="button" onClick={hide}>
						{t('${i18nPrefix}.cancel')}
					</Button>

					<form.Subscribe selector={state => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting, values: state.values })}>
						{({ canSubmit, isSubmitting, values }) => {
							const isDisabled =
								!canSubmit ||
								isSubmitting ||
								${mutationCamel}.isPending ||
								!${schemaName}.safeParse(values).success
							return (
								<Button type="submit" disabled={isDisabled}>
									{(isSubmitting || ${mutationCamel}.isPending) && <Spinner className="mr-2" />}
									{t('${i18nPrefix}.submit')}
								</Button>
							)
						}}
					</form.Subscribe>
				</DialogFooter>
			</form>
		</DialogContent>
	)
}
`
}

// -----------------------------------------------------------------------------
// Shape 2: delete — AlertDialog + mutation
// -----------------------------------------------------------------------------

function buildDeleteDialog(args: { pascal: string; mutation?: string; invalidate: string[]; i18nPrefix: string }): string {
	const { pascal, mutation, invalidate, i18nPrefix } = args
	const mutationCamel = mutation ? toCamelCase(mutation.replace(/^use/, '')) : ''

	const invalidationLines = invalidate.length
		? invalidate
				.map(h => {
					const keyFn = `${h.replace(/^use/, '').charAt(0).toLowerCase() + h.replace(/^use/, '').slice(1)}QueryKey`
					return `\t\t\t\t\tawait queryClient.invalidateQueries({ queryKey: ${keyFn}() })`
				})
				.join('\n')
		: '\t\t\t\t\t// no invalidation'

	const invalidateImports = invalidate
		.map(h => `${h.replace(/^use/, '').charAt(0).toLowerCase() + h.replace(/^use/, '').slice(1)}QueryKey`)
		.join(',\n\t')

	const sdkImports = [mutation, ...(invalidate.length ? [invalidateImports] : [])]
		.filter(Boolean)
		.map(s => `\t${s}`)
		.join(',\n')

	const handlerBody = mutation
		? `\t\tawait ${mutationCamel}.mutateAsync(
\t\t\t{ id /* TODO: confirm key */ },
\t\t\t{
\t\t\t\tonSuccess: () => {
\t\t\t\t\ttoast.success(t('${i18nPrefix}.success'))
\t\t\t\t\thide()
\t\t\t\t},
\t\t\t\tonSettled: async () => {
${invalidationLines}
\t\t\t\t},
\t\t\t},
\t\t)`
		: `\t\thide()
\t\t// TODO: parent component reacts via useDialogStore.confirm() Promise`

	const pendingMarker = mutation ? `${mutationCamel}.isPending` : 'false'

	return `import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogCancel,
	AlertDialogAction,
} from '@codm/app-ui/alert-dialog'
import { Spinner } from '@codm/app-ui/spinner'
${mutation ? `import {\n${sdkImports},\n} from '${REPO.sdkSpecifier}'\n` : ''}import { useDialogStore } from '@/stores/useDialogStore'
import { useTranslation } from 'react-i18next'

interface ${pascal}Props {
	id: string
}

export function ${pascal}({ id }: ${pascal}Props) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	${mutation ? `const ${mutationCamel} = ${mutation}()\n\t` : ''}const { hide } = useDialogStore()

	const handleConfirm = async () => {
${handlerBody}
	}

	return (
		<AlertDialog open onOpenChange={open => !open && hide()}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t('${i18nPrefix}.title')}</AlertDialogTitle>
					<AlertDialogDescription>{t('${i18nPrefix}.description')}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel onClick={hide}>{t('${i18nPrefix}.cancel')}</AlertDialogCancel>
					<AlertDialogAction variant="destructive" disabled={${pendingMarker}} onClick={handleConfirm}>
						{${pendingMarker} ? (
							<>
								<Spinner className="mr-2" />
								{t('${i18nPrefix}.deleting')}
							</>
						) : (
							t('${i18nPrefix}.confirm')
						)}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
`
}

// -----------------------------------------------------------------------------
// Shape 3: confirm — bare AlertDialog resolving useDialogStore.confirm()
// -----------------------------------------------------------------------------

function buildConfirmDialog(args: { pascal: string; i18nPrefix: string }): string {
	const { pascal, i18nPrefix } = args
	return `import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogCancel,
	AlertDialogAction,
} from '@codm/app-ui/alert-dialog'
import { useDialogStore } from '@/stores/useDialogStore'
import { useTranslation } from 'react-i18next'

interface ${pascal}Props {
	onConfirm: () => void
	onCancel?: () => void
}

export function ${pascal}({ onConfirm, onCancel }: ${pascal}Props) {
	const { t } = useTranslation()
	const { hide } = useDialogStore()

	const handleCancel = () => {
		onCancel?.()
		hide()
	}

	const handleConfirm = () => {
		onConfirm()
		hide()
	}

	return (
		<AlertDialog open onOpenChange={open => !open && handleCancel()}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t('${i18nPrefix}.title')}</AlertDialogTitle>
					<AlertDialogDescription>{t('${i18nPrefix}.description')}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel onClick={handleCancel}>{t('${i18nPrefix}.cancel')}</AlertDialogCancel>
					<AlertDialogAction onClick={handleConfirm}>{t('${i18nPrefix}.confirm')}</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
`
}
