import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import {
	getWorkspacePublishCommandQueryKey,
	setWorkspacePublishCommandMutationRequestSchema,
	useGetWorkspacePublishCommand,
	useSetWorkspacePublishCommand,
} from '@codm/client-typescript/typescript'
import type { GetWorkspacePublishCommandQueryResponse, SetWorkspacePublishCommandMutationRequest } from '@codm/client-typescript/typescript'
import { Button } from '@codm/app-ui/button'
import { DialogFooter } from '@codm/app-ui/dialog'
import { Field, FieldDescription, FieldError, FieldLegend, FieldSet } from '@codm/app-ui/field'
import { Input } from '@codm/app-ui/input'
import { Skeleton } from '@codm/app-ui/skeleton'
import { Spinner } from '@codm/app-ui/spinner'
import { cn } from '@/lib/utils'

interface PublishCommandFormProps extends ComponentProps<'form'> {
	workspaceId: string
	/** Called where the dialog shell calls `hide()` — after a save or a removal landed. */
	onDone?: () => void
}

/**
 * The workspace's PUBLISH COMMAND (fase 4, item 6c): what CODM runs in the task's worktree when an answer
 * authorizes publishing. Owns its read (`useGetWorkspacePublishCommand`) so the card never fetches — nor
 * shows — the command: it may carry a credential in an argument.
 */
export function PublishCommandForm({ workspaceId, ...props }: PublishCommandFormProps) {
	const { data, isLoading } = useGetWorkspacePublishCommand(workspaceId)

	if (isLoading || !data) {
		return (
			<div className={cn('flex flex-col gap-2', props.className)}>
				<Skeleton className="h-4 w-24" />
				<Skeleton className="h-9 w-full" />
			</div>
		)
	}
	// Mounted only once the read landed: the declared argv IS the form's `defaultValues` — no effect syncing it in.
	return <PublishCommandFields workspaceId={workspaceId} current={data.command} {...props} />
}

function PublishCommandFields({
	workspaceId,
	current,
	onDone,
	className,
	...props
}: PublishCommandFormProps & { current: GetWorkspacePublishCommandQueryResponse['command'] }) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	// Invalidation on the HOOK, so it is awaited before the per-call `onSuccess` closes the dialog: reopening
	// right after a save never prefills from the stale cached command.
	const setCommand = useSetWorkspacePublishCommand({
		mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getWorkspacePublishCommandQueryKey(workspaceId) }) },
	})

	// Typed as the whole BODY (the schema below validates it), but the form only ever edits a declared command;
	// removal (`command: null`) is its own action below. A workspace without a command starts with one empty
	// argument for the operator to fill.
	const defaultValues: SetWorkspacePublishCommandMutationRequest = {
		command: { argv: current?.argv ?? [''] },
	}

	// The SAME schema the controller validates — 1..64 arguments, each non-empty and ≤ 4096 chars. Nothing
	// here restates those rules, and no argument is ever trimmed, split or joined: each field IS one argv item.
	const form = useForm({
		defaultValues,
		validators: { onChange: setWorkspacePublishCommandMutationRequestSchema },
		onSubmit: ({ value }) => {
			setCommand.mutate({ workspaceId, data: value }, { onSuccess: () => onDone?.() })
		},
	})

	const removeCommand = () => {
		setCommand.mutate({ workspaceId, data: { command: null } }, { onSuccess: () => onDone?.() })
	}

	return (
		<form
			noValidate
			className={cn(className)}
			{...props}
			onSubmit={e => {
				e.preventDefault()
				e.stopPropagation()
				form.handleSubmit()
			}}
		>
			<form.Field name="command.argv" mode="array">
				{argvField => (
					<FieldSet>
						<FieldLegend variant="label">{t('workspaces.publishCommand.argumentsLabel')}</FieldLegend>
						<FieldDescription>{t('workspaces.publishCommand.argumentsHint')}</FieldDescription>
						<ol className="flex flex-col gap-2">
							{(argvField.state.value ?? []).map((_, index) => (
								// Index keys on purpose: the array's identity IS the position (argv order), and TanStack's
								// `removeValue` re-indexes the sub-fields the same way.
								<li key={index}>
									<form.Field name={`command.argv[${index}]`}>
										{field => (
											<Field>
												<div className="flex gap-2">
													<Input
														id={field.name}
														className="font-mono"
														aria-label={t('workspaces.publishCommand.argument', { n: index + 1 })}
														autoComplete="off"
														spellCheck={false}
														value={field.state.value ?? ''}
														onBlur={field.handleBlur}
														onChange={e => field.handleChange(e.target.value)}
													/>
													<Button
														type="button"
														variant="ghost"
														size="icon"
														aria-label={t('workspaces.publishCommand.removeArgument', { n: index + 1 })}
														disabled={(argvField.state.value?.length ?? 0) <= 1}
														onClick={() => argvField.removeValue(index)}
													>
														<IconTrash className="size-4" />
													</Button>
												</div>
												<FieldError errors={field.state.meta.errors} />
											</Field>
										)}
									</form.Field>
								</li>
							))}
						</ol>
						<FieldError errors={argvField.state.meta.errors} />
						<Button type="button" variant="outline" size="sm" className="self-start" onClick={() => argvField.pushValue('')}>
							<IconPlus data-icon="inline-start" /> {t('workspaces.publishCommand.addArgument')}
						</Button>
					</FieldSet>
				)}
			</form.Field>

			<DialogFooter className="mt-6">
				{current && (
					<Button type="button" variant="destructive" className="sm:mr-auto" disabled={setCommand.isPending} onClick={removeCommand}>
						{t('workspaces.publishCommand.remove')}
					</Button>
				)}
				<Button type="button" variant="outline" onClick={onDone}>
					{t('common.cancel')}
				</Button>
				<form.Subscribe selector={s => [s.canSubmit, s.isSubmitting] as const}>
					{([canSubmit, isSubmitting]) => (
						<Button type="submit" disabled={!canSubmit || setCommand.isPending}>
							{isSubmitting || setCommand.isPending ? <Spinner className="mr-2" /> : null}
							{setCommand.isPending ? t('workspaces.publishCommand.saving') : t('workspaces.publishCommand.save')}
						</Button>
					)}
				</form.Subscribe>
			</DialogFooter>
		</form>
	)
}
