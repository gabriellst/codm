import { useTranslation } from 'react-i18next'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import {
	useCreateTask,
	useGetListView,
	createTaskMutationRequestSchema,
	getListViewQueryKey,
	getBoardViewQueryKey,
	TaskPriorityEnum,
	type CreateTaskMutationRequest,
} from '@codedm/client-typescript/typescript'

import { DeepPartial } from '@/lib'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useDialogStore } from '@/stores/useDialogStore'

export function CreateTaskDialog({ spaceId }: { spaceId: string }) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const hide = useDialogStore(s => s.hide)

	// Load the space's lists for the list picker
	const { data: listView } = useGetListView(spaceId)
	const lists = listView?.lists ?? []

	// H1: onSuccess declared on the hook, not on mutateAsync call sites
	const createTask = useCreateTask({
		mutation: {
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: getListViewQueryKey(spaceId) })
				queryClient.invalidateQueries({ queryKey: getBoardViewQueryKey(spaceId) })
				hide()
			},
		},
	})

	// A5/A6: typed DeepPartial const — no useForm<T> type arg
	const defaultValues: DeepPartial<CreateTaskMutationRequest> = {
		spaceId,
		listId: lists[0]?.listId ?? '',
		title: '',
		priority: TaskPriorityEnum.NORMAL,
		assigneeIds: [],
	}

	const form = useForm({
		defaultValues,
		validators: { onChange: createTaskMutationRequestSchema },
		onSubmit: async ({ value }) => {
			const result = createTaskMutationRequestSchema.safeParse(value)
			if (!result.success) return
			await createTask.mutateAsync({ data: result.data })
		},
	})

	return (
		<DialogContent className="sm:max-w-md">
			<DialogHeader>
				<DialogTitle>{t('clickup.createTask.title')}</DialogTitle>
			</DialogHeader>

			<form
				noValidate
				className="flex flex-col gap-4"
				onSubmit={e => {
					e.preventDefault()
					e.stopPropagation()
					form.handleSubmit()
				}}
			>
				<FieldGroup>
					{/* listId — compound Select with dynamic list options */}
					<form.Field name="listId">
						{field => {
							const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
							return (
								<Field>
									<FieldLabel htmlFor={field.name}>{t('clickup.createTask.listLabel')}</FieldLabel>
									<Select
										value={field.state.value ?? null}
										onValueChange={(v: string | null) => { if (v != null) field.handleChange(v) }}
									>
										<SelectTrigger id={field.name} aria-invalid={isInvalid}>
											<SelectValue>
												{field.state.value
													? lists.find(l => l.listId === field.state.value)?.name ?? field.state.value
													: undefined}
											</SelectValue>
										</SelectTrigger>
										<SelectContent>
											{lists.map(list => (
												<SelectItem key={list.listId} value={list.listId}>
													{list.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{isInvalid && <FieldError errors={field.state.meta.errors} />}
								</Field>
							)
						}}
					</form.Field>

					{/* title — text Input */}
					<form.Field name="title">
						{field => {
							const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
							return (
								<Field>
									<FieldLabel htmlFor={field.name}>{t('clickup.createTask.titleLabel')}</FieldLabel>
									<Input
										id={field.name}
										value={field.state.value ?? ''}
										onBlur={field.handleBlur}
										onChange={e => field.handleChange(e.target.value)}
										placeholder={t('clickup.createTask.titlePlaceholder')}
										aria-invalid={isInvalid}
									/>
									{isInvalid && <FieldError errors={field.state.meta.errors} />}
								</Field>
							)
						}}
					</form.Field>

					{/* priority — A13: Select in enum mode */}
					<form.Field name="priority">
						{field => {
							const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
							return (
								<Field>
									<FieldLabel htmlFor={field.name}>{t('clickup.createTask.priorityLabel')}</FieldLabel>
									<Select
										enum={TaskPriorityEnum}
										i18nPrefix="enums.TaskPriority"
										value={field.state.value}
										onValueChange={field.handleChange}
										id={field.name}
										aria-invalid={isInvalid}
									/>
									{isInvalid && <FieldError errors={field.state.meta.errors} />}
								</Field>
							)
						}}
					</form.Field>
				</FieldGroup>

				<DialogFooter>
					<Button type="button" variant="outline" onClick={hide}>
						{t('common.cancel')}
					</Button>

					{/* FRM-P19/P20: safeParse-driven submit gate */}
					<form.Subscribe
						selector={s => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting, values: s.values })}
					>
						{({ canSubmit, isSubmitting, values }) => {
							const isPending = isSubmitting || createTask.isPending
							const isDisabled =
								!canSubmit || isPending || !createTaskMutationRequestSchema.safeParse(values).success
							return (
								<Button type="submit" disabled={isDisabled}>
									{isPending && <Spinner className="mr-2" />}
									{t('clickup.createTask.submit')}
								</Button>
							)
						}}
					</form.Subscribe>
				</DialogFooter>
			</form>
		</DialogContent>
	)
}
