import { useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { IconAlertTriangle, IconFileImport } from '@tabler/icons-react'
import {
	getSettingsQueryKey,
	useImportMcpServers,
	usePreviewMcpImport,
	McpApprovalPolicyEnum,
	type PreviewMcpImportMutationResponse,
} from '@codm/client-typescript/typescript'
import { Button } from '@codm/app-ui/button'
import { Checkbox } from '@codm/app-ui/checkbox'
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@codm/app-ui/dialog'
import { Field, FieldLabel } from '@codm/app-ui/field'
import { Spinner } from '@codm/app-ui/spinner'
import { Textarea } from '@codm/app-ui/textarea'
import { surface } from '@codm/app-ui/surfaces'
import { enumLabel } from '@/lib'
import { cn } from '@/lib/utils'

type SourceResult = PreviewMcpImportMutationResponse['sources'][number]
type Candidate = SourceResult['candidates'][number]

/**
 * O DIÁLOGO DE IMPORT — o que já existe na máquina, e o que não pôde vir.
 *
 * ### As rejeições ficam na tela, ao lado dos candidatos
 * Não num "ver detalhes", não num toast que some. Um import que mostra 2 de 3 servidores faz o dono
 * concluir que o terceiro nunca existiu — e é justamente o terceiro que ele vai passar meia hora
 * procurando. O motivo vem do contrato (`McpImportRejection`), então a tela traduz um enum em vez de
 * inventar frase.
 *
 * ### O segredo chega vazio e a tela DIZ isso
 * O import traz os NOMES das variáveis, nunca os valores (decisão do founder, 04/09/2026). Um
 * servidor importado com `envKeys` chega desabilitado de fato — o formulário de reconfiguração
 * bloqueia o salvar enquanto houver segredo em branco. Avisar aqui é o que evita o dono importar,
 * fechar, e descobrir sozinho depois.
 *
 * ### Uma seção por fonte
 * Porque "isto veio do MEU repositório" e "isto veio da config global da máquina" são confianças
 * diferentes, mesmo quando o conteúdo é idêntico. O backend já entrega separado; achatar aqui
 * jogaria fora a informação que sustenta a decisão.
 */
export function McpImportDialog({
	workspacePaths = [],
	onDone,
	className,
	...props
}: Omit<ComponentProps<typeof DialogContent>, 'children'> & {
	/**
	 * Os workspaces do dono — RECEBIDOS POR PROP, como os presets e pelo mesmo motivo (a seção é a dona
	 * da leitura; o rail CP-03 cobra isso de um `index.tsx` sob `routes/**`).
	 *
	 * SEM ISTO, TRÊS DAS QUATRO FONTES SÃO INALCANÇÁVEIS. Medido contra o daemon vivo: a prévia sem
	 * `workspacePath` devolve `CLAUDE_CODE` vazia (a configuração de lá vive sob
	 * `projects['<caminho>']`) e nem procura o `.mcp.json`. A tela mostrava a seção vazia sem dizer por
	 * quê, e o dono concluiria que não tinha nada para importar.
	 */
	workspacePaths?: string[]
	onDone: () => void
}) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()

	const [pasted, setPasted] = useState('')
	/**
	 * QUAL workspace a varredura usa. Um só ⇒ não há escolha a fazer e o seletor não aparece; vários ⇒
	 * o dono escolhe, porque importar a configuração de um projeto que não é o dele seria pior que não
	 * importar nada (é a mesma decisão que o parser já toma ao filtrar por caminho).
	 */
	const [workspacePath, setWorkspacePath] = useState(workspacePaths[0] ?? '')
	const [chosen, setChosen] = useState<Record<string, boolean>>({})

	const preview = usePreviewMcpImport()
	const importServers = useImportMcpServers()

	const sources = preview.data?.sources ?? []
	// A chave de seleção carrega a FONTE junto: duas fontes podem publicar o mesmo `key`, e sem isso
	// marcar um marcaria o outro.
	const idOf = (source: SourceResult, candidate: Candidate): string => `${source.source}:${candidate.key}`

	const selected = sources.flatMap(source =>
		source.candidates.filter(candidate => chosen[idOf(source, candidate)]).map(candidate => candidate),
	)
	const anyBlankSecret = selected.some(candidate => candidate.envKeys.length > 0 || candidate.headerKeys.length > 0)

	return (
		<DialogContent className={cn('flex max-h-[80vh] flex-col gap-4', className)} {...props}>
			<DialogHeader>
				<DialogTitle>{t('settings.mcpServers.import.title')}</DialogTitle>
			</DialogHeader>

			<Field>
				<FieldLabel htmlFor="mcp-import-paste">{t('settings.mcpServers.import.pasteLabel')}</FieldLabel>
				<Textarea
					id="mcp-import-paste"
					value={pasted}
					onChange={event => setPasted(event.target.value)}
					placeholder={t('settings.mcpServers.import.pastePlaceholder')}
					className="min-h-24 font-mono text-xs"
				/>
			</Field>

			{/* Só aparece quando há ESCOLHA a fazer. Um workspace só não é uma decisão, é um fato — e um
			    seletor de um item é ruído que o dono precisa ler para descobrir que não precisava ler. */}
			{workspacePaths.length > 1 && (
				<Field>
					<FieldLabel htmlFor="mcp-import-workspace">{t('settings.mcpServers.import.workspaceLabel')}</FieldLabel>
					<select
						id="mcp-import-workspace"
						value={workspacePath}
						onChange={event => setWorkspacePath(event.target.value)}
						className="w-full rounded-asymmetric-sm border border-border bg-background px-3 py-2 text-xs"
					>
						{workspacePaths.map(path => (
							<option key={path} value={path}>
								{path}
							</option>
						))}
					</select>
				</Field>
			)}

			<Button
				type="button"
				variant="ghost"
				size="sm"
				disabled={preview.isPending}
				onClick={() => preview.mutate({ data: { pasted: pasted.trim() || undefined, workspacePath: workspacePath || undefined } })}
			>
				{preview.isPending ? <Spinner data-icon="inline-start" /> : <IconFileImport data-icon="inline-start" />}
				{t('settings.mcpServers.import.scan')}
			</Button>

			<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
				{sources.map(source => (
					<section key={source.source} className={cn('flex flex-col gap-2 rounded-asymmetric-sm px-4 py-3', surface)}>
						<div className="flex flex-col">
							<span className="font-bold text-foreground text-sm">{enumLabel('McpConfigSource', source.source)}</span>
							{/* O CAMINHO fica visível: o dono precisa saber QUAL arquivo foi lido, não só que "algo" foi. */}
							{source.path && <span className="truncate text-muted-foreground text-xs">{source.path}</span>}
						</div>

						{source.candidates.map(candidate => (
							<label key={candidate.key} className="flex items-center gap-2.5 text-sm">
								<Checkbox
									checked={chosen[idOf(source, candidate)] ?? false}
									onCheckedChange={checked => setChosen(prev => ({ ...prev, [idOf(source, candidate)]: checked === true }))}
								/>
								<span className="font-medium text-foreground">{candidate.key}</span>
								<span className="text-muted-foreground text-xs">{enumLabel('McpTransport', candidate.transport)}</span>
								{(candidate.envKeys.length > 0 || candidate.headerKeys.length > 0) && (
									<span className="text-muted-foreground text-xs">
										{t('settings.mcpServers.import.secretsCount', { count: candidate.envKeys.length + candidate.headerKeys.length })}
									</span>
								)}
							</label>
						))}

						{/* AS REJEIÇÕES, NA MESMA TELA. Ver o docblock: escondê-las é o defeito. */}
						{source.rejections.map(rejection => (
							<div key={`${rejection.key}:${rejection.reason}`} className="flex items-center gap-2.5 text-muted-foreground text-xs">
								<IconAlertTriangle className="size-3.5 shrink-0" />
								<span className="font-medium">{rejection.key || t('settings.mcpServers.import.wholeDocument')}</span>
								<span>{enumLabel('McpImportRejection', rejection.reason)}</span>
								{rejection.detail && <span className="opacity-70">({rejection.detail})</span>}
							</div>
						))}

						{source.candidates.length === 0 && source.rejections.length === 0 && (
							<span className="text-muted-foreground text-xs">{t('settings.mcpServers.import.sourceEmpty')}</span>
						)}
					</section>
				))}
			</div>

			{anyBlankSecret && <p className="text-muted-foreground text-xs">{t('settings.mcpServers.import.secretsWillBeBlank')}</p>}

			<DialogFooter>
				<Button type="button" variant="ghost" onClick={onDone}>
					{t('settings.mcpServers.form.cancel')}
				</Button>
				<Button
					type="button"
					disabled={selected.length === 0 || importServers.isPending}
					onClick={() =>
						importServers.mutate(
							{
								data: {
									// A política entra como ASK para todos: um servidor que acabou de chegar de um
									// arquivo é exatamente o caso em que perguntar antes é o default certo.
									approvalPolicy: McpApprovalPolicyEnum.ASK,
									entries: selected.map(candidate => ({
										key: candidate.key,
										transport: candidate.transport,
										command: candidate.command,
										args: candidate.args,
										url: candidate.url,
										envKeys: candidate.envKeys,
										headerKeys: candidate.headerKeys,
									})),
								},
							},
							{
								onSuccess: async () => {
									await queryClient.invalidateQueries({ queryKey: getSettingsQueryKey() })
									onDone()
								},
							},
						)
					}
				>
					{importServers.isPending && <Spinner data-icon="inline-start" />}
					{t('settings.mcpServers.import.confirm', { count: selected.length })}
				</Button>
			</DialogFooter>
		</DialogContent>
	)
}
