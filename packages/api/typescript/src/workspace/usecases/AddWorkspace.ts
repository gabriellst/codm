import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { WorkspaceBadge } from '@codm/contracts-typescript/wire/enums'
import { Workspace } from '../entities/Workspace'
import { WorkspaceRepository } from '../repositories/WorkspaceRepository'
import { WorkspaceDetector } from '../services/WorkspaceDetector'
import { WorkspaceAddedEvent } from '../events/WorkspaceAddedEvent'
import type { ApplicationErrors } from '../errors'

/**
 * Caminho ABSOLUTO em qualquer SO em que o daemon roda — UMA regex, sem `node:path`, porque este
 * schema atravessa o fio: o OpenAPI emite `pattern`, o Kubb re-emite `.regex(...)` em
 * `addWorkspaceMutationRequestSchema` (os três forms do console validam com ele) e o progenitor
 * cunha `AddWorkspaceBodyPath` (client rust) com o MESMO padrão. Uma alternativa por família:
 *   `/…`              POSIX (macOS, Linux)
 *   `C:\…` / `C:/…`   Windows com letra de unidade — o separador logo após `:` é obrigatório
 *                     (`C:acme` é relativo à unidade corrente, não absoluto)
 *   `\\servidor\…`    UNC (cobre também a forma estendida `\\?\C:\…`)
 * Era `.startsWith('/')`, que rejeitava TODO caminho do Windows antes de o detector olhar o disco.
 * O caminho NÃO é normalizado (separadores/case) — o dedupe por owner é textual, e o Windows FS
 * ser case-insensitive é limitação aceita nesta fase.
 */
export const ABSOLUTE_PATH_PATTERN = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/

export const AddWorkspaceInputSchema = z.object({
	ownerId: z.uuid(),
	// Absolute path selected via the native folder picker — bounded and shape-checked at the edge.
	path: z.string().trim().min(1).max(1024).regex(ABSOLUTE_PATH_PATTERN),
})

export const AddWorkspaceOutputSchema = z.object({
	workspaceId: z.uuid(),
	badges: z.array(z.enum(WorkspaceBadge)),
})

/**
 * C05 AddWorkspace — verifies the path exists locally + is a directory, dedupes by absolute path
 * (per owner), detects git/Claude badges, persists the Workspace and raises `workspace.added`.
 */
@injectable()
export class AddWorkspace extends Handler<typeof AddWorkspaceInputSchema, typeof AddWorkspaceOutputSchema> {
	readonly name = 'add_workspace' as const
	readonly inputSchema = AddWorkspaceInputSchema
	readonly outputSchema = AddWorkspaceOutputSchema

	constructor(
		private readonly workspaces: WorkspaceRepository,
		private readonly detector: WorkspaceDetector,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const inspection = await this.detector.inspect(input.path)
		if (!inspection.exists) throw new BaseError<ApplicationErrors>('PATH_NOT_FOUND', `no such path: ${input.path}`)
		if (!inspection.isDirectory) throw new BaseError<ApplicationErrors>('PATH_NOT_A_DIRECTORY', `not a directory: ${input.path}`)

		const existing = await this.workspaces.findByOwnerAndPath(input.ownerId, input.path)
		if (existing) throw new BaseError<ApplicationErrors>('WORKSPACE_ALREADY_REGISTERED', `already registered: ${input.path}`)

		return this.withTransaction(tx, async tx => {
			const workspace = Workspace.create({ ownerId: input.ownerId, path: input.path, badges: inspection.badges })
			await this.workspaces.save(workspace, tx)

			await this.domainEventRepository.save(
				new WorkspaceAddedEvent({
					entityId: workspace.id.value,
					ownerId: input.ownerId,
					payload: { workspaceId: workspace.id.value, path: workspace.path, badges: workspace.badges },
				}),
				tx,
			)

			return { workspaceId: workspace.id.value, badges: workspace.badges }
		})
	}
}
