import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from '@tanstack/react-form'
import { IconChevronRight } from '@tabler/icons-react'
import { attachThreadMutationRequestSchema } from '@codm/client-typescript/typescript'
import type { GetAttachThreadWizardQueryResponse } from '@codm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { workspaceBadgeVariant } from '@/components/console/glyphs'
import { enumLabel, type DeepPartial } from '@/lib'
import { cn } from '@/lib/utils'
import { StepHeading } from '../StepHeading'

export const WorkspaceStepSchema = attachThreadMutationRequestSchema.pick({ workspaceId: true })
export type WorkspaceStepData = (typeof WorkspaceStepSchema)['_zod']['output']

type WorkspaceStepProps = Omit<ComponentProps<'form'>, 'onSubmit'> & {
	workspaces: GetAttachThreadWizardQueryResponse['workspaces']
	defaultValues?: DeepPartial<WorkspaceStepData>
	onSubmit: (data: WorkspaceStepData) => void
	onBack?: () => void
}

export function WorkspaceStep({ workspaces, defaultValues, onSubmit, onBack, className, ...props }: WorkspaceStepProps) {
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
	 * ESCOLHER É RESPONDER — o clique na linha entrega o passo, sem passar pelo botão Continuar.
	 *
	 * `workspaceId` é um campo ESCALAR: clicar noutra linha SUBSTITUI a anterior, então não há estado
	 * intermediário entre "escolhi" e "terminei". O Continuar cobrava um segundo clique que apenas
	 * repetia o que o primeiro já dissera. (O passo de agentes NÃO ganha isto — lá a seleção é uma
	 * lista, e o primeiro clique não é a resposta inteira; veja o docblock do AgentsStep.)
	 *
	 * Entrega por `handleSubmit()` em vez de chamar `onSubmit` direto: assim o clique atravessa o portão
	 * de validação do form (o `safeParse` acima) e não um caminho paralelo que pudesse aceitar o que o
	 * form recusaria.
	 *
	 * O RODAPÉ SUMIU POR INTEIRO. O Continuar já era redundante desde que o clique entrega, e o Voltar
	 * subiu para o `StepHeading` — sem ação e sem volta, não sobrou barra de baixo.
	 *
	 * A versão anterior deste docblock defendia manter o Continuar como "o que fecha o passo quando ele
	 * reabre já preenchido por `defaultValues` (voltar e seguir sem reescolher)". Aquele caminho não se
	 * perdeu, ele só mudou de gesto: `selectAndAdvance` não pergunta se o valor MUDOU, então clicar de
	 * novo na linha que já está selecionada entrega o passo igual. É um teste, não uma promessa — veja
	 * "voltar e seguir sem reescolher" na suíte. Um `if (workspaceId === selected) return` posto aqui
	 * como otimização trancaria o operador no passo, e é ele que aquele caso derruba.
	 */
	const selectAndAdvance = (workspaceId: string) => {
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
			<StepHeading title={t('attach.stepWorkspaceTitle')} subtitle={t('attach.stepWorkspaceSubtitle')} onBack={onBack} />

			<form.Subscribe selector={state => state.values.workspaceId}>
				{selected => (
					<div className="flex flex-col gap-1">
						{workspaces.map(workspace => (
							<Button
								variant={'ghost'}
								size={'none'}
								key={workspace.workspaceId}
								type="button"
								onClick={() => selectAndAdvance(workspace.workspaceId)}
								className={cn(
									'flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-muted',
									selected === workspace.workspaceId && 'bg-muted',
								)}
							>
								<div className="flex min-w-0 flex-1 flex-col gap-1.5">
									<span className="truncate font-mono text-sm font-semibold text-foreground">{workspace.path}</span>
									<div className="flex flex-wrap gap-1.5">
										{workspace.badges.map(badge => (
											<Badge key={badge} variant={workspaceBadgeVariant[badge]}>
												{enumLabel('WorkspaceBadge', badge)}
											</Badge>
										))}
									</div>
								</div>
								<IconChevronRight className="size-4 text-muted-foreground" />
							</Button>
						))}
					</div>
				)}
			</form.Subscribe>
		</form>
	)
}
