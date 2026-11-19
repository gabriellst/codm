export { AddWorkspaceController } from './AddWorkspace'
export { RemoveWorkspaceController } from './RemoveWorkspace'
export { ListWorkspacesController } from './ListWorkspaces'
// Fase 4 — the declared publish command (item 6c): the console-only write door, NO `mcpScopes` (its read is the BFF's,
// `ui/controllers/GetWorkspacePublishCommand`).
export { SetWorkspacePublishCommandController } from './SetWorkspacePublishCommand'

import { AddWorkspaceController } from './AddWorkspace'
import { RemoveWorkspaceController } from './RemoveWorkspace'
import { ListWorkspacesController } from './ListWorkspaces'
import { SetWorkspacePublishCommandController } from './SetWorkspacePublishCommand'

/**
 * O QUE ESTE CONTEXTO MONTA (Decisão 10). Todo contexto expõe o mesmo símbolo, e é isso que deixa o
 * gerador da composição sem ramo — nos 7 mecânicos é o barril inteiro, nos três que carregam
 * condicional a seleção mora aqui, ao lado das classes que ela escolhe.
 */
export default {
	AddWorkspaceController,
	RemoveWorkspaceController,
	ListWorkspacesController,
	SetWorkspacePublishCommandController,
}
