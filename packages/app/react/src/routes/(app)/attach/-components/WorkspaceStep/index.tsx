import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from '@tanstack/react-form'
import { IconCheck, IconChevronRight, IconFolder } from '@tabler/icons-react'
import { attachThreadMutationRequestSchema } from '@codm/client-typescript/typescript'
import type { GetAttachThreadWizardQueryResponse } from '@codm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { workspaceBadgeVariant } from '@/components/console/glyphs'
import { enumLabel, type DeepPartial } from '@/lib'
import { cn } from '@/lib/utils'
import { row } from '@/components/ui/surfaces'
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

export function WorkspaceStep({ workspaces, defaultValues, onSubmit, className, ...props }: WorkspaceStepProps) {
	const { t } = useTranslation()

	const form = useForm({
		defaultValues,
		validators: { onChange: WorkspaceStepSchema },
		onSubmit: async form => {
			const result = WorkspaceStepSchema.safeParse(form.value)
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
		form.setFieldValue('workspaceId', workspaceId)
		void form.handleSubmit()
	}

	return (
		<form
			className={cn('flex flex-col gap-5', className)}
			{...props}
			onSubmit={e => {
				e.preventDefault()
				e.stopPropagation()
				form.handleSubmit()
			}}
		>
			<StepHeading title={t('attach.stepWorkspaceTitle')} subtitle={t('attach.stepWorkspaceSubtitle')} />

			<form.Subscribe selector={state => state.values.workspaceId}>
				{selected => (
					// `gap-2`, não `gap-1`: cada linha tem borda própria agora — a folga é a das outras telas.
					<div className="flex flex-col gap-2">
						{workspaces.map(workspace => (
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
						))}
					</div>
				)}
			</form.Subscribe>
		</form>
	)
}
