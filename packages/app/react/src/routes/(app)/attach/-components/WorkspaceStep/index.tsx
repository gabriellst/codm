import { type ComponentProps, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { IconCheck, IconChevronRight, IconFolder, IconPlus } from '@tabler/icons-react'
import {
	addWorkspaceMutationRequestSchema,
	attachThreadMutationRequestSchema,
	getAttachThreadWizardQueryKey,
	listWorkspacesQueryKey,
	useAddWorkspace,
} from '@codm/client-typescript/typescript'
import type { GetAttachThreadWizardQueryResponse } from '@codm/client-typescript/typescript'
import { Button } from '@codm/app-ui/button'
import { Badge } from '@codm/app-ui/badge'
import { Field, FieldError, FieldLabel } from '@codm/app-ui/field'
import { Input } from '@codm/app-ui/input'
import { Spinner } from '@codm/app-ui/spinner'
import { workspaceBadgeVariant } from '@/components/console/glyphs'
import { enumLabel, type DeepPartial } from '@/lib'
import { cn } from '@/lib/utils'
import { useFilePicker } from '@/services'
import { dashedRow, row } from '@codm/app-ui/surfaces'
import { StepHeading } from '../StepHeading'

export const WorkspaceStepSchema = attachThreadMutationRequestSchema.pick({ workspaceId: true })
export type WorkspaceStepData = (typeof WorkspaceStepSchema)['_zod']['output']

// No `onBack` — the wizard's persistent footer (`AttachThreadWizard`) owns Voltar for every step now
// (D3, founder review 12/08); `StepHeading` no longer renders a back button for any step to opt into.
type WorkspaceStepProps = Omit<ComponentProps<'form'>, 'onSubmit'> & {
	workspaces: GetAttachThreadWizardQueryResponse['workspaces']
	defaultValues?: DeepPartial<WorkspaceStepData>
	onSubmit: (data: WorkspaceStepData) => void
}

/**
 * Selection step of the attach wizard — pick ONE registered workspace, OR register a new folder
 * right here (founder request, 2026-08-25): until now the step could only choose among folders
 * already registered, so an operator whose project wasn't on the list had to abandon the wizard,
 * go to `/workspaces`, add it, and start over. The "+ Adicionar uma pasta" ROW below the list is the
 * SAME affordance the onboarding step ships (`OnboardingWorkspaceStep`): `dashedRow` shell (canon 30),
 * picker-first through the `FilePickerService` PORT (native dialog on desktop), honest manual input
 * fallback when the host has no path-capable picker (browser, e2e Chromium).
 *
 * ADD IS IMMEDIATE HERE — unlike onboarding, where "Próximo" confirms. This step's footer button is
 * owned by `AttachThreadWizard` and gated on `workspaceId` alone; a pending-not-yet-added path would
 * need a second confirm hook the wizard has no seam for, and the `/workspaces` screen's own
 * `AddWorkspaceForm` already registers on submit. So: pick (or type + Enter/"Adicionar pasta") →
 * `POST /workspaces` → invalidate BOTH `listWorkspaces` and `getAttachThreadWizard` (this list is
 * fed by the latter — the same double invalidation `AddWorkspaceForm` documents) → the fresh
 * `workspaceId` is recorded through `selectWorkspace`, the exact path a row click takes, so the new
 * folder shows up already selected and the footer's Continuar lights up without a second click.
 *
 * Errors (`PATH_NOT_A_DIRECTORY`, `WORKSPACE_ALREADY_REGISTERED`, …) are the global `MutationCache`'s
 * (component bp-22) — no `onError`, no try/catch; pending state is the hook's own `isPending`.
 */
export function WorkspaceStep({ workspaces, defaultValues, onSubmit, className, ...props }: WorkspaceStepProps) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()

	// `selectionForm`, not `form`: the name `form` is reserved below for the instance that owns a
	// `form.Field` (the manual path input) — rail B (`tests/architecture/form-field.test.ts`) keys on
	// that literal to prove every data `Input` under `-components/` lives inside a `form.Field`.
	const selectionForm = useForm({
		defaultValues,
		validators: { onChange: WorkspaceStepSchema },
		onSubmit: async ({ value }) => {
			const result = WorkspaceStepSchema.safeParse(value)
			if (!result.success) return
			onSubmit(result.data)
		},
	})

	/**
	 * O CLIQUE GRAVA A ESCOLHA — NÃO AVANÇA MAIS O PASSO (D3, founder review 12/08). A versão anterior
	 * ("escolher é responder") chamava `advance()` no mesmo gesto do clique; o founder testou essa
	 * versão no desktop e revogou — o rodapé do wizard voltou, persistente, e é ele quem move o passo.
	 * `workspaceId` é um campo ESCALAR: clicar noutra linha SUBSTITUI a anterior, sem estado
	 * intermediário — mas "substituir" só grava agora, via `onSubmit`, no `useAttachWizardStore` do
	 * pai, que por sua vez habilita o Continuar do footer.
	 *
	 * Entrega por `handleSubmit()` em vez de chamar `onSubmit` direto: assim o clique atravessa o portão
	 * de validação do form (o `safeParse` acima) e não um caminho paralelo que pudesse aceitar o que o
	 * form recusaria.
	 *
	 * "Voltar e seguir sem reescolher" continua coberto: `selectWorkspace` não pergunta se o valor
	 * MUDOU, então clicar de novo na linha já selecionada grava (e entrega) o mesmo valor — ver
	 * `ReclickAlreadySelectedStillDelivers` na suíte. Um `if (workspaceId === selected) return` posto
	 * aqui como otimização travaria esse caso.
	 */
	const selectWorkspace = (workspaceId: string) => {
		selectionForm.setFieldValue('workspaceId', workspaceId)
		void selectionForm.handleSubmit()
	}

	// ─── "Adicionar uma pasta" — register a new workspace without leaving the wizard ──────────────
	// `onSuccess` lives in the HOOK's mutation options (component bp-30), never `mutate()`'s second
	// argument — those callbacks live on the React Query OBSERVER and are skipped if this component
	// unmounts before the response lands, while the hook's own survive. `form` below is referenced
	// through closure only — this callback never runs before `form` is assigned (mutation success is
	// always later than the render that declares it).
	const addWorkspace = useAddWorkspace({
		mutation: {
			onSuccess: res => {
				queryClient.invalidateQueries({ queryKey: listWorkspacesQueryKey() })
				// This list is fed by `getAttachThreadWizard`, not `listWorkspaces` — without this second
				// invalidation the folder just created would not appear until an accidental refetch (same
				// reason `AddWorkspaceForm` invalidates both).
				queryClient.invalidateQueries({ queryKey: getAttachThreadWizardQueryKey() })
				setShowManualInput(false)
				form.reset()
				// Same path a row click takes — the fresh folder is recorded as THE selection.
				selectWorkspace(res.workspaceId)
			},
		},
	})
	const filePicker = useFilePicker()
	const [canPickFolder, setCanPickFolder] = useState(false)
	useEffect(() => {
		let cancelled = false
		filePicker.supportsFolderPicker().then(supported => {
			if (!cancelled) setCanPickFolder(supported)
		})
		return () => {
			cancelled = true
		}
	}, [filePicker])
	const [showManualInput, setShowManualInput] = useState(false)

	// The SAME schema the controller validates (`AddWorkspaceForm`'s exact pattern): a native pick and a
	// typed path share one source of truth and one validation path — the picker result is written the
	// way a keystroke would be (`setFieldValue`) and then submitted through the same gate.
	const form = useForm({
		defaultValues: { path: '' },
		validators: { onChange: addWorkspaceMutationRequestSchema },
		onSubmit: async ({ value }) => {
			addWorkspace.mutate({ data: value })
		},
	})

	// Picker-first: the OS dialog opens BEFORE any input ever renders whenever the port reports
	// capable; the manual input only appears when the host genuinely has no path-capable picker.
	const handleAddClick = async () => {
		if (!canPickFolder) {
			setShowManualInput(true)
			return
		}
		const picked = await filePicker.pickFolder({ title: t('workspaces.addTitle') })
		if (!picked) return
		form.setFieldValue('path', picked)
		await form.handleSubmit()
	}

	return (
		<form
			className={cn('flex flex-col gap-5', className)}
			{...props}
			onSubmit={e => {
				e.preventDefault()
				e.stopPropagation()
				selectionForm.handleSubmit()
			}}
		>
			<StepHeading title={t('attach.stepWorkspaceTitle')} subtitle={t('attach.stepWorkspaceSubtitle')} />

			{/* `gap-2`, não `gap-1`: cada linha tem borda própria agora — a folga é a das outras telas. */}
			<div className="flex flex-col gap-2">
				<selectionForm.Subscribe selector={state => state.values.workspaceId}>
					{selected =>
						workspaces.map(workspace => (
							<Button
								variant={'ghost'}
								size={'none'}
								key={workspace.workspaceId}
								type="button"
								onClick={() => selectWorkspace(workspace.workspaceId)}
								// D3 (screen EWECP) — mesma CONTENT ROW das outras listas: preset `row` +
								// `rounded-asymmetric-md` (18/18/18/6 medido, não `-lg`). Nenhuma linha aqui é
								// inerte, então o composto `row` (borda + hover junto) serve inteiro.
								className={cn(
									'group flex items-center gap-4 rounded-asymmetric-md bg-background p-4 text-left',
									row,
									// ESCOLHIDO = o pastel do hover, fixo, + a borda de marca — o mesmo par nos três
									// passos do assistente; ver o docblock do `AgentsStep`.
									selected === workspace.workspaceId && 'border-primary bg-hover-accent',
								)}
							>
								{/* D3 — folder icon tile (40px, `asymmetric-xs`) leading the row, same tile shape as
								    the agent card's icon. Previous shape had no icon here — path + badges only. */}
								<span className="flex size-10 shrink-0 items-center justify-center rounded-asymmetric-xs bg-muted text-muted-foreground">
									<IconFolder className="size-4.5" />
								</span>
								<span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-foreground">{workspace.path}</span>
								<div className="flex shrink-0 flex-wrap items-center gap-1.5">
									{workspace.badges.map(badge => (
										<Badge key={badge} variant={workspaceBadgeVariant[badge]}>
											{enumLabel('WorkspaceBadge', badge)}
										</Badge>
									))}
								</div>
								{selected === workspace.workspaceId ? (
									// D3 (screen EWECP) — same filled check badge as the contact/agents rows.
									<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
										<IconCheck className="size-3.5" />
									</span>
								) : (
									// GROUP CONVENTION (surfaces): o chevron ecoa o hover da linha, sem `hover:` próprio.
									<IconChevronRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
								)}
							</Button>
						))
					}
				</selectionForm.Subscribe>

				{/* The add ROW — "+" left, label right, dashed shell shared with the onboarding step and
				    `dashedTile` (canon 30). ALWAYS visible here (unlike onboarding's single-folder flow):
				    attach picks one of MANY, and the list is allowed to keep growing. */}
				<Button
					type="button"
					variant="ghost"
					size="none"
					disabled={addWorkspace.isPending}
					onClick={handleAddClick}
					className={cn(dashedRow, 'justify-start')}
				>
					<span className="flex size-9 shrink-0 items-center justify-center rounded-asymmetric-sm bg-muted text-muted-foreground">
						{addWorkspace.isPending ? <Spinner className="size-4.5" /> : <IconPlus className="size-4.5" />}
					</span>
					<span className="text-sm font-bold text-foreground">
						{addWorkspace.isPending ? t('workspaces.adding') : t('workspaces.addFolderRow')}
					</span>
				</Button>

				{/* Fallback honesto (nenhum picker capaz de path — browser): o MESMO input de path manual que
				    `AddWorkspaceForm` usa, em vez de fingir um picker que o host não tem. Enter ou o botão
				    "Adicionar pasta" registram — `type="button"`, porque este input vive DENTRO do `<form>`
				    de seleção acima e um submit nativo cairia no gate errado (`WorkspaceStepSchema`). */}
				{showManualInput && (
					<form.Field name="path">
						{field => (
							<Field>
								<FieldLabel htmlFor={field.name}>{t('workspaces.projectFolder')}</FieldLabel>
								<div className="flex gap-2">
									<Input
										id={field.name}
										className="font-mono"
										placeholder={t('workspaces.pathPlaceholder')}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={e => field.handleChange(e.target.value)}
										onKeyDown={e => {
											if (e.key !== 'Enter') return
											e.preventDefault()
											void form.handleSubmit()
										}}
										autoFocus
									/>
									<form.Subscribe selector={s => s.canSubmit}>
										{canSubmit => (
											<Button type="button" disabled={!canSubmit || addWorkspace.isPending} onClick={() => form.handleSubmit()}>
												{addWorkspace.isPending ? t('workspaces.adding') : t('workspaces.addFolder')}
											</Button>
										)}
									</form.Subscribe>
								</div>
								{field.state.meta.errors[0] && <FieldError>{String(field.state.meta.errors[0]?.message ?? '')}</FieldError>}
							</Field>
						)}
					</form.Field>
				)}
			</div>
		</form>
	)
}
